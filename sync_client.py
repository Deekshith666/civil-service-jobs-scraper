"""Client utility to synchronize scraped Civil Service jobs to live production via API."""

import logging
import time
from typing import Dict, List, Optional
import requests

from config import LIVE_APP_URL, SYNC_API_KEY
import database

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("cs_sync_client")


def push_jobs_to_live(
    jobs: List[Dict],
    live_url: Optional[str] = None,
    sync_key: Optional[str] = None,
    source: str = "scraper_cli",
    timeout: int = 25
) -> Dict:
    """
    Transmit a batch of job dictionaries to the live production sync endpoint.
    
    :param jobs: List of job dictionaries to sync
    :param live_url: Base URL of the live app (defaults to LIVE_APP_URL)
    :param sync_key: Secret authentication token (defaults to SYNC_API_KEY)
    :param source: Identifier of the sync caller (e.g. 'scraper_cli', 'scheduled_cron')
    :param timeout: HTTP request timeout in seconds
    :return: Summary dictionary returned by the live API
    """
    url = (live_url or LIVE_APP_URL).rstrip("/")
    key = (sync_key or SYNC_API_KEY).strip()

    if not key:
        err_msg = (
            "SYNC_API_KEY is not configured in .env or environment variables. "
            "Cannot authenticate with live production endpoint."
        )
        logger.error(err_msg)
        return {"status": "error", "message": err_msg, "synced_count": 0}

    if not jobs:
        logger.info("No jobs to sync. Payload is empty.")
        return {"status": "skipped", "message": "No jobs to sync.", "synced_count": 0}

    endpoint = f"{url}/api/sync/jobs"
    headers = {
        "X-Sync-Token": key,
        "Content-Type": "application/json",
        "User-Agent": "CivilServiceScraper-SyncClient/1.0"
    }
    payload = {
        "jobs": jobs,
        "source": source
    }

    logger.info(f"Initiating live sync of {len(jobs)} jobs to {endpoint}...")
    
    max_retries = 3
    delay = 2.0
    for attempt in range(1, max_retries + 1):
        try:
            res = requests.post(endpoint, json=payload, headers=headers, timeout=timeout)
            if res.status_code == 200:
                data = res.json()
                logger.info(
                    f"==> Live Sync Succeeded! Synced {data.get('synced_count', len(jobs))} jobs "
                    f"(Inserted: {data.get('inserted', 0)}, Updated: {data.get('updated', 0)}). "
                    f"Total live catalog: {data.get('total_jobs_in_catalog', 'unknown')} vacancies."
                )
                return data
            elif res.status_code in (401, 403):
                logger.error(f"Live sync authorization failed (HTTP {res.status_code}): {res.text}")
                return {
                    "status": "unauthorized",
                    "message": "Invalid SYNC_API_KEY. Please check that the key matches on both local and Vercel.",
                    "synced_count": 0
                }
            else:
                logger.warning(
                    f"Sync attempt {attempt}/{max_retries} received HTTP {res.status_code}: {res.text}"
                )
        except Exception as err:
            logger.warning(f"Sync attempt {attempt}/{max_retries} failed with error: {err}")

        if attempt < max_retries:
            time.sleep(delay)
            delay *= 2

    err_msg = f"Failed to sync jobs to {endpoint} after {max_retries} attempts."
    logger.error(err_msg)
    return {"status": "failed", "message": err_msg, "synced_count": 0}


def sync_today_jobs(
    live_url: Optional[str] = None,
    sync_key: Optional[str] = None,
    limit: Optional[int] = None
) -> Dict:
    """
    Query all jobs first detected today from the local database and push them to live.
    """
    today_jobs = database.get_today_new_jobs(limit=limit)
    logger.info(f"Found {len(today_jobs)} jobs detected today in local database.")
    if not today_jobs:
        return {
            "status": "empty",
            "message": "No jobs detected today in local database to sync.",
            "synced_count": 0
        }

    return push_jobs_to_live(
        jobs=today_jobs,
        live_url=live_url,
        sync_key=sync_key,
        source="sync_today_cli"
    )
