"""Civil Service Jobs scraper with automated ALTCHA PoW solver and incremental scraping."""

import base64
import hashlib
import json
import logging
import re
import time
from typing import Callable, Dict, List, Optional, Set
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from config import (
    BASE_URL,
    CSR_CAPTCHA_URL,
    CSR_INDEX_URL,
    REQUEST_DELAY,
    REQUEST_TIMEOUT,
    USER_AGENT,
)
from database import (
    get_existing_references,
    log_scrape_run,
    upsert_job,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("cs_scraper")


class CivilServiceScraper:
    """Scraper for the UK Civil Service Jobs portal."""

    def __init__(self, delay: float = REQUEST_DELAY):
        self.delay = delay
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-GB,en;q=0.9",
        })

    def _solve_altcha(self, challenge_data: dict) -> str:
        """
        Solve the ALTCHA proof-of-work challenge.
        Computes SHA-512 / SHA-256 until the target hash is matched.
        """
        salt = challenge_data["salt"]
        target = challenge_data["challenge"]
        algo = challenge_data.get("algorithm", "SHA-512")
        max_number = challenge_data.get("maxnumber", 300000)

        logger.info(f"Solving ALTCHA challenge (algo={algo}, max={max_number})...")
        start_t = time.time()
        
        solution_number = None
        for n in range(max_number + 1):
            val = (salt + str(n)).encode("utf-8")
            if algo == "SHA-512":
                h = hashlib.sha512(val).hexdigest()
            elif algo == "SHA-256":
                h = hashlib.sha256(val).hexdigest()
            else:
                h = hashlib.sha512(val).hexdigest()

            if h == target:
                solution_number = n
                break

        if solution_number is None:
            raise RuntimeError("Failed to solve ALTCHA challenge within max number limit")

        logger.info(f"ALTCHA solved: n={solution_number} in {time.time() - start_t:.3f}s")
        payload = {
            "algorithm": algo,
            "challenge": target,
            "number": solution_number,
            "salt": salt,
            "signature": challenge_data["signature"],
        }
        return base64.b64encode(json.dumps(payload).encode("utf-8")).decode("utf-8")

    def _bypass_protection_if_needed(self, initial_html: str) -> None:
        """Check for anti-bot challenge and solve it if present."""
        token_match = re.search(r'name=["\']originalRequestToken["\']\s+value=["\']([^"\']+)["\']', initial_html)
        if not token_match:
            logger.info("No anti-bot challenge detected on landing page.")
            return

        token = token_match.group(1)
        logger.info("Anti-bot challenge detected. Requesting PoW parameters...")
        c_res = self.session.get(CSR_CAPTCHA_URL, timeout=REQUEST_TIMEOUT)
        c_res.raise_for_status()
        c_data = c_res.json()

        b64_payload = self._solve_altcha(c_data)
        post_data = {
            "altcha": b64_payload,
            "originalRequestToken": token,
        }

        logger.info("Submitting PoW verification...")
        submit_res = self.session.post(CSR_INDEX_URL, data=post_data, timeout=REQUEST_TIMEOUT)
        submit_res.raise_for_status()
        logger.info("Verification succeeded and session established.")

    def _submit_search(self) -> str:
        """
        Open index page, submit job search form, and switch sort to 'Most recent' (opening).
        Returns the HTML content of page 1 of the search results.
        """
        logger.info(f"Fetching initial portal page: {CSR_INDEX_URL}")
        res = self.session.get(CSR_INDEX_URL, timeout=REQUEST_TIMEOUT)
        res.raise_for_status()
        self._bypass_protection_if_needed(res.text)

        # Re-fetch index page with verified session
        index_res = self.session.get(CSR_INDEX_URL, timeout=REQUEST_TIMEOUT)
        soup = BeautifulSoup(index_res.text, "html.parser")

        # Find search form (typically form 2 or action containing esearch.cgi)
        search_form = None
        for form in soup.find_all("form"):
            action = form.get("action", "")
            if "esearch.cgi" in action or form.find("input", {"name": "search_button"}):
                search_form = form
                break

        if not search_form:
            # Fallback to the third form or form with submit button
            forms = soup.find_all("form")
            if len(forms) >= 3:
                search_form = forms[2]
            elif forms:
                search_form = forms[-1]
            else:
                raise RuntimeError("Could not locate search form on index page")

        action_url = search_form.get("action", "")
        if not action_url.startswith("http"):
            action_url = urljoin(BASE_URL, action_url)

        # Collect form inputs
        form_data = {}
        for inp in search_form.find_all(["input", "button", "select"]):
            name = inp.get("name")
            if name:
                form_data[name] = inp.get("value", "")

        form_data["search_button"] = "Search for jobs"
        form_data["csource"] = form_data.get("csource", "csqsearch")

        logger.info(f"Submitting job search to {action_url}...")
        results_res = self.session.post(action_url, data=form_data, timeout=REQUEST_TIMEOUT)
        results_res.raise_for_status()
        results_soup = BeautifulSoup(results_res.text, "html.parser")

        # Switch sort order to 'opening' (Most recent)
        sort_form = results_soup.find("form", id="results_sort_form") or results_soup.find("form", {"name": "results_sort_form"})
        if sort_form:
            sort_action = sort_form.get("action", "")
            if not sort_action.startswith("http"):
                sort_action = urljoin(BASE_URL, sort_action)

            sort_data = {
                inp.get("name"): inp.get("value", "")
                for inp in sort_form.find_all("input")
                if inp.get("name")
            }
            sort_data["sort"] = "opening"
            sort_data["submit_results_sort_form"] = "Refresh sort"

            logger.info("Applying sort by 'Most recent' (opening)...")
            sorted_res = self.session.get(sort_action, params=sort_data, timeout=REQUEST_TIMEOUT)
            sorted_res.raise_for_status()
            return sorted_res.text

        logger.warning("Could not find sort form; using default results order")
        return results_res.text

    def _parse_job_cards(self, page_html: str) -> List[Dict]:
        """Extract job listings from a search results page."""
        soup = BeautifulSoup(page_html, "html.parser")
        job_elements = soup.find_all("li", class_="search-results-job-box")
        jobs = []

        for elem in job_elements:
            # Title & URL
            title_tag = elem.find("h3", class_="search-results-job-box-title")
            title = ""
            job_url = ""
            if title_tag:
                link = title_tag.find("a")
                if link:
                    title = link.get_text(strip=True)
                    raw_href = link.get("href", "")
                    job_url = urljoin(BASE_URL, raw_href)
                else:
                    title = title_tag.get_text(strip=True)

            if not title:
                continue

            # Reference number
            ref_code = ""
            ref_elem = elem.find("div", class_="search-results-job-box-refcode")
            if ref_elem:
                # Clean out label
                for tag in ref_elem.find_all(["h4", "span"]):
                    tag.decompose()
                ref_code = ref_elem.get_text(strip=True)
            
            if not ref_code:
                # Fallback: extract from hidden dref div
                dref_elem = elem.find("div", id=re.compile(r"^dref-"))
                if dref_elem:
                    m = re.search(r"Reference\s*:\s*([A-Za-z0-9]+)", dref_elem.get_text())
                    if m:
                        ref_code = m.group(1)

            if not ref_code:
                # Fallback: extract from URL
                m = re.search(r"joblist_view_vac=([0-9]+)", job_url)
                if m:
                    ref_code = m.group(1)
                else:
                    # Hash title as a last resort
                    ref_code = hashlib.md5(title.encode()).hexdigest()[:10]

            # Department
            dept_elem = elem.find("div", class_="search-results-job-box-department")
            department = ""
            if dept_elem:
                for tag in dept_elem.find_all(["h4", "span"]):
                    tag.decompose()
                department = dept_elem.get_text(strip=True)

            # Location
            loc_elem = elem.find("div", class_="search-results-job-box-location")
            location = ""
            if loc_elem:
                for tag in loc_elem.find_all(["h4", "span"]):
                    tag.decompose()
                location = loc_elem.get_text(strip=True)

            # Salary & parsed range
            sal_elem = elem.find("div", class_="search-results-job-box-salary")
            salary = ""
            if sal_elem:
                for tag in sal_elem.find_all(["h4", "span"]):
                    tag.decompose()
                salary = sal_elem.get_text(strip=True)

            from database import parse_salary_range
            s_min, s_max = parse_salary_range(salary)

            # Closing Date
            close_elem = elem.find("div", class_="search-results-job-box-closingdate")
            closing_date = ""
            if close_elem:
                for tag in close_elem.find_all(["h4", "span"]):
                    tag.decompose()
                closing_date = close_elem.get_text(strip=True)

            # Logo Image
            logo_elem = elem.find("img", class_="search-results-job-box-logo-image-legacy")
            logo_url = ""
            if logo_elem and logo_elem.get("src"):
                logo_url = urljoin(BASE_URL, logo_elem.get("src"))

            jobs.append({
                "reference_number": ref_code,
                "title": title,
                "department": department,
                "location": location,
                "salary": salary,
                "salary_min": s_min,
                "salary_max": s_max,
                "closing_date": closing_date,
                "job_url": job_url,
                "logo_url": logo_url,
            })

        return jobs

    def fetch_job_detail_metadata(self, job_url: str) -> dict:
        """Fetch detailed metadata fields from an individual vacancy page."""
        try:
            res = self.session.get(job_url, timeout=REQUEST_TIMEOUT)
            if res.status_code != 200:
                return {}
            soup = BeautifulSoup(res.text, "html.parser")
            fields = {}
            for f in soup.find_all("div", class_="vac_display_field"):
                h = f.find(["h3", "h4", "span"])
                val = f.find("div", class_="vac_display_field_value")
                if h and val:
                    val_text = val.get_text(separator=", ", strip=True)
                    fields[h.get_text(strip=True).lower()] = val_text

            return {
                "job_grade": fields.get("job grade"),
                "contract_type": fields.get("contract type"),
                "working_pattern": fields.get("working pattern"),
                "role_type": fields.get("type of role"),
            }
        except Exception as e:
            logger.debug(f"Failed to fetch detail metadata for {job_url}: {e}")
            return {}

    def enrich_jobs(self, limit: Optional[int] = None, max_workers: int = 6, progress_callback: Optional[Callable[[dict], None]] = None) -> int:
        """Fetch and store detailed metadata (grade, contract, pattern, role) for jobs in database."""
        from database import get_jobs_missing_details, update_job_metadata
        from concurrent.futures import ThreadPoolExecutor

        # Ensure session is authenticated with anti-bot bypass first
        self.session.get(CSR_INDEX_URL, timeout=REQUEST_TIMEOUT)
        res = self.session.get(CSR_INDEX_URL, timeout=REQUEST_TIMEOUT)
        self._bypass_protection_if_needed(res.text)

        batch_size = limit or 200
        jobs_to_enrich = get_jobs_missing_details(limit=batch_size)
        if not jobs_to_enrich:
            logger.info("No jobs missing details found in database.")
            return 0

        logger.info(f"Enriching {len(jobs_to_enrich)} jobs with detailed metadata (workers={max_workers})...")
        enriched_count = 0

        def process_job(job):
            meta = self.fetch_job_detail_metadata(job["job_url"])
            if meta and any(meta.values()):
                update_job_metadata(job["reference_number"], meta)
                return True
            return False

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            for success in executor.map(process_job, jobs_to_enrich):
                if success:
                    enriched_count += 1
                if progress_callback:
                    progress_callback({
                        "enriched": enriched_count,
                        "total": len(jobs_to_enrich)
                    })

        logger.info(f"Enrichment completed: {enriched_count}/{len(jobs_to_enrich)} jobs enriched.")
        return enriched_count

    def _find_next_page_url(self, page_html: str) -> Optional[str]:
        """Find the link URL for the next results page."""
        soup = BeautifulSoup(page_html, "html.parser")
        next_link = soup.find("a", string=re.compile(r"next|»", re.IGNORECASE))
        if next_link and next_link.get("href"):
            return urljoin(BASE_URL, next_link.get("href"))
        return None

    def scrape(
        self,
        mode: str = "incremental",
        max_pages: Optional[int] = None,
        progress_callback: Optional[Callable[[dict], None]] = None,
    ) -> Dict:
        """
        Execute job scraping run.

        :param mode: 'incremental' (stop when known jobs hit) or 'full' (scrape all pages)
        :param max_pages: Maximum pages to scrape (optional, useful to throttle or test)
        :param progress_callback: Optional callback receiving progress updates
        :return: Summary dictionary of the scrape run
        """
        start_time = time.time()
        existing_refs: Set[str] = get_existing_references()
        is_initial_run = len(existing_refs) == 0
        actual_mode = "initial" if is_initial_run else mode

        logger.info(
            f"Starting {actual_mode.upper()} scrape run. "
            f"Known jobs in DB: {len(existing_refs)}"
        )

        pages_scraped = 0
        jobs_found = 0
        new_jobs_added = 0
        status = "success"
        error_msg = None

        try:
            # Step 1: Submit search & apply sort
            current_html = self._submit_search()
            page_num = 1

            while current_html:
                pages_scraped += 1
                page_jobs = self._parse_job_cards(current_html)
                jobs_found += len(page_jobs)

                logger.info(f"Page {page_num}: Found {len(page_jobs)} jobs.")

                page_new_count = 0
                page_known_count = 0

                for job in page_jobs:
                    ref = job["reference_number"]
                    is_known = ref in existing_refs
                    
                    if is_known:
                        page_known_count += 1
                    else:
                        page_new_count += 1
                        existing_refs.add(ref)

                    is_new = upsert_job(job)
                    if is_new:
                        new_jobs_added += 1

                if progress_callback:
                    progress_callback({
                        "page": page_num,
                        "pages_scraped": pages_scraped,
                        "jobs_found": jobs_found,
                        "new_jobs_added": new_jobs_added,
                        "status": "running"
                    })

                # Check stopping condition for incremental mode
                # Since results are sorted by newest first, once we encounter jobs that are already in the DB,
                # we have reached jobs from yesterday/earlier runs.
                if actual_mode == "incremental" and not is_initial_run:
                    # If more than 50% of the page is already known or page has known jobs,
                    # all subsequent pages are older.
                    if page_known_count > 0 and page_new_count == 0:
                        logger.info(
                            f"Incremental stop condition met at page {page_num}: "
                            f"All {page_known_count} jobs on page already known."
                        )
                        break
                    elif page_known_count >= 10:
                        logger.info(
                            f"Incremental stop condition met at page {page_num}: "
                            f"Found {page_known_count} already-known jobs."
                        )
                        break

                if max_pages and page_num >= max_pages:
                    logger.info(f"Reached user-specified max_pages limit ({max_pages}).")
                    break

                # Get next page URL
                next_url = self._find_next_page_url(current_html)
                if not next_url:
                    logger.info("No next page link found. Reached end of results.")
                    break

                logger.info(f"Fetching next page ({page_num + 1})...")
                time.sleep(self.delay)
                retries = 3
                while retries > 0:
                    try:
                        next_res = self.session.get(next_url, timeout=REQUEST_TIMEOUT)
                        next_res.raise_for_status()
                        current_html = next_res.text
                        break
                    except Exception as err:
                        retries -= 1
                        if retries == 0:
                            raise
                        logger.warning(f"Page fetch failed: {err}. Retrying in 2s ({retries} left)...")
                        time.sleep(2)
                page_num += 1

        except Exception as e:
            logger.exception(f"Scraper error during run: {e}")
            status = "failed"
            error_msg = str(e)

        duration = round(time.time() - start_time, 2)
        log_id = log_scrape_run(
            mode=actual_mode,
            pages_scraped=pages_scraped,
            jobs_found=jobs_found,
            new_jobs_added=new_jobs_added,
            duration_seconds=duration,
            status=status,
            error_message=error_msg,
        )

        result_summary = {
            "log_id": log_id,
            "mode": actual_mode,
            "pages_scraped": pages_scraped,
            "jobs_found": jobs_found,
            "new_jobs_added": new_jobs_added,
            "duration_seconds": duration,
            "status": status,
            "error": error_msg,
        }
        logger.info(f"Scrape completed: {result_summary}")
        return result_summary
