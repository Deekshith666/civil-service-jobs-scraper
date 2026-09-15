"""FastAPI web application to display scraped Civil Service jobs and control scraping runs."""

import os
from typing import Optional
from fastapi import FastAPI, BackgroundTasks, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel

import database
from scraper import CivilServiceScraper

app = FastAPI(title="Civil Service Jobs Explorer")

# Static and template paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# In-memory scrape job state
active_scrape_state = {
    "is_running": False,
    "mode": None,
    "pages_scraped": 0,
    "jobs_found": 0,
    "new_jobs_added": 0,
    "last_result": None,
    "error": None
}

# In-memory enrichment state
active_enrich_state = {
    "is_running": False,
    "enriched": 0,
    "total": 0,
    "error": None
}


def _run_scraper_task(mode: str, max_pages: Optional[int]):
    """Background execution runner for on-demand scrape."""
    global active_scrape_state
    active_scrape_state["is_running"] = True
    active_scrape_state["mode"] = mode
    active_scrape_state["pages_scraped"] = 0
    active_scrape_state["jobs_found"] = 0
    active_scrape_state["new_jobs_added"] = 0
    active_scrape_state["error"] = None

    def progress_callback(update: dict):
        active_scrape_state["pages_scraped"] = update.get("pages_scraped", 0)
        active_scrape_state["jobs_found"] = update.get("jobs_found", 0)
        active_scrape_state["new_jobs_added"] = update.get("new_jobs_added", 0)

    try:
        scraper = CivilServiceScraper()
        res = scraper.scrape(
            mode=mode,
            max_pages=max_pages,
            progress_callback=progress_callback
        )
        active_scrape_state["last_result"] = res
    except Exception as e:
        active_scrape_state["error"] = str(e)
    finally:
        active_scrape_state["is_running"] = False


def _run_enrichment_task(limit: Optional[int], max_workers: int):
    """Background task to fetch detail metadata (grade, contract, pattern, role) for jobs."""
    global active_enrich_state
    active_enrich_state["is_running"] = True
    active_enrich_state["enriched"] = 0
    active_enrich_state["total"] = limit or database.count_jobs_missing_details()
    active_enrich_state["error"] = None

    def progress_callback(update: dict):
        active_enrich_state["enriched"] = update.get("enriched", 0)
        active_enrich_state["total"] = update.get("total", 0)

    try:
        scraper = CivilServiceScraper()
        scraper.enrich_jobs(
            limit=limit,
            max_workers=max_workers,
            progress_callback=progress_callback
        )
    except Exception as e:
        active_enrich_state["error"] = str(e)
    finally:
        active_enrich_state["is_running"] = False


@app.get("/", response_class=HTMLResponse)
async def serve_index():
    """Serve the main interactive dashboard UI."""
    index_path = os.path.join(TEMPLATES_DIR, "index.html")
    return FileResponse(index_path)


@app.get("/api/stats")
async def get_stats():
    """Return dashboard summary metrics."""
    stats = database.get_dashboard_stats()
    stats["missing_details"] = database.count_jobs_missing_details()
    return stats


@app.get("/api/filters")
async def get_filters():
    """Return all available faceted filter options for the search sidebar."""
    options = database.get_filter_options()
    options["missing_details"] = database.count_jobs_missing_details()
    return options


def _safe_int(val: Optional[str]) -> Optional[int]:
    """Safely parse integer query param that might be an empty string."""
    if val is None or val == "":
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


@app.get("/api/jobs")
async def get_jobs(
    search: str = Query("", description="Search term"),
    department: str = Query("", description="Filter by department"),
    location: str = Query("", description="Filter by location"),
    min_salary: Optional[str] = Query(None, description="Minimum salary threshold"),
    max_salary: Optional[str] = Query(None, description="Maximum salary threshold"),
    job_grade: str = Query("", description="Filter by job grade"),
    role_type: str = Query("", description="Filter by type of role"),
    working_pattern: str = Query("", description="Filter by working pattern"),
    contract_type: str = Query("", description="Filter by contract type"),
    only_new_today: bool = Query(False, description="Filter to jobs first detected today"),
    limit: int = Query(24, ge=1, le=100),
    offset: int = Query(0, ge=0),
    sort_by: str = Query("first_seen_at", description="Field to sort by"),
    sort_order: str = Query("desc", description="Sort order: asc or desc")
):
    """Retrieve filtered and paginated job postings with multi-facet support."""
    parsed_min_salary = _safe_int(min_salary)
    parsed_max_salary = _safe_int(max_salary)

    jobs = database.get_jobs(
        search=search,
        department=department,
        location=location,
        min_salary=parsed_min_salary,
        max_salary=parsed_max_salary,
        job_grade=job_grade,
        role_type=role_type,
        working_pattern=working_pattern,
        contract_type=contract_type,
        only_new_today=only_new_today,
        limit=limit,
        offset=offset,
        sort_by=sort_by,
        sort_order=sort_order
    )
    total = database.count_jobs(
        search=search,
        department=department,
        location=location,
        min_salary=parsed_min_salary,
        max_salary=parsed_max_salary,
        job_grade=job_grade,
        role_type=role_type,
        working_pattern=working_pattern,
        contract_type=contract_type,
        only_new_today=only_new_today
    )
    return {
        "jobs": jobs,
        "total": total,
        "limit": limit,
        "offset": offset
    }


@app.get("/api/departments")
async def get_departments():
    """Return list of distinct departments."""
    return database.get_departments()


@app.get("/api/logs")
async def get_logs(limit: int = Query(10, ge=1, le=50)):
    """Return recent scrape execution logs."""
    return database.get_recent_logs(limit=limit)


class ScrapeRequest(BaseModel):
    mode: str = "incremental"
    max_pages: Optional[int] = None


@app.post("/api/scrape")
async def trigger_scrape(request: ScrapeRequest, background_tasks: BackgroundTasks):
    """Trigger an on-demand scraper run."""
    global active_scrape_state
    if active_scrape_state["is_running"]:
        return {"status": "busy", "message": "A scrape run is already in progress."}

    background_tasks.add_task(_run_scraper_task, request.mode, request.max_pages)
    return {"status": "started", "mode": request.mode, "max_pages": request.max_pages}


@app.get("/api/scrape/status")
async def get_scrape_status():
    """Check the status of an ongoing or recent scrape job."""
    return active_scrape_state


class EnrichRequest(BaseModel):
    limit: Optional[int] = 200
    max_workers: int = 8


@app.post("/api/enrich")
async def trigger_enrichment(request: EnrichRequest, background_tasks: BackgroundTasks):
    """Trigger background enrichment of job details (grades, roles, contracts, patterns)."""
    global active_enrich_state
    if active_enrich_state["is_running"]:
        return {"status": "busy", "message": "Enrichment is already in progress."}

    background_tasks.add_task(_run_enrichment_task, request.limit, request.max_workers)
    return {"status": "started", "limit": request.limit}


@app.get("/api/enrich/status")
async def get_enrich_status():
    """Check status of job enrichment."""
    return active_enrich_state
