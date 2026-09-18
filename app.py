"""FastAPI web application to display scraped Civil Service jobs and control scraping runs."""

import os
import io
import secrets
import logging
from datetime import datetime
import re
from html import escape as html_escape
from typing import Any, Dict, List, Optional
from fastapi import (
    FastAPI, BackgroundTasks, Query, Depends, HTTPException,
    Header, Cookie, Request, Response, UploadFile, File, Form, status
)
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse, Response
from pydantic import BaseModel

import config
import database

logger = logging.getLogger("cs_app")
from scraper import CivilServiceScraper
from ai_service import ai_service, DEFAULT_CV_TEMPLATE

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


def _run_scraper_task(mode: str, max_pages: Optional[int], sync_to_live: bool = False):
    """Background execution runner for on-demand scrape."""
    global active_scrape_state
    active_scrape_state["is_running"] = True
    active_scrape_state["mode"] = mode
    active_scrape_state["pages_scraped"] = 0
    active_scrape_state["jobs_found"] = 0
    active_scrape_state["new_jobs_added"] = 0
    active_scrape_state["error"] = None
    active_scrape_state["live_sync_result"] = None

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

        # If sync to live is requested and new jobs were found, push to live API
        if sync_to_live and res.get("new_jobs"):
            try:
                import sync_client
                sync_res = sync_client.push_jobs_to_live(res["new_jobs"], source="dashboard_modal")
                active_scrape_state["live_sync_result"] = sync_res
            except Exception as sync_err:
                logger.error(f"Post-scrape live sync failed: {sync_err}")
                active_scrape_state["live_sync_error"] = str(sync_err)
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


NO_CACHE_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0"
}


@app.get("/static/css/style.css")
async def serve_css():
    """Explicit static handler for main stylesheet."""
    css_path = os.path.join(STATIC_DIR, "css", "style.css")
    return FileResponse(css_path, media_type="text/css", headers=NO_CACHE_HEADERS)


@app.get("/static/css/tailor.css")
async def serve_tailor_css():
    """Explicit static handler for tailor studio stylesheet."""
    css_path = os.path.join(STATIC_DIR, "css", "tailor.css")
    return FileResponse(css_path, media_type="text/css", headers=NO_CACHE_HEADERS)


@app.get("/static/js/app.js")
async def serve_js():
    """Explicit static handler for client controller."""
    js_path = os.path.join(STATIC_DIR, "js", "app.js")
    return FileResponse(js_path, media_type="application/javascript", headers=NO_CACHE_HEADERS)


@app.get("/static/js/tailor.js")
async def serve_tailor_js():
    """Explicit static handler for tailor studio controller."""
    js_path = os.path.join(STATIC_DIR, "js", "tailor.js")
    return FileResponse(js_path, media_type="application/javascript", headers=NO_CACHE_HEADERS)


@app.get("/", response_class=HTMLResponse)
async def serve_index():
    """Serve the main interactive dashboard UI."""
    index_path = os.path.join(TEMPLATES_DIR, "index.html")
    return FileResponse(index_path, headers=NO_CACHE_HEADERS)


@app.get("/tailor", response_class=HTMLResponse)
@app.get("/tailor/{ref_code}", response_class=HTMLResponse)
async def serve_tailor(ref_code: Optional[str] = None):
    """Serve the dedicated CV Tailor, Keyword & Application Studio UI."""
    tailor_path = os.path.join(TEMPLATES_DIR, "tailor.html")
    return FileResponse(tailor_path, headers=NO_CACHE_HEADERS)


@app.get("/api/stats")
async def get_stats():
    """Return dashboard summary metrics."""
    stats = database.get_dashboard_stats()
    stats["missing_details"] = database.count_jobs_missing_details()
    stats["is_vercel"] = config.IS_VERCEL
    stats["is_writable"] = database.is_database_writable()
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
    department: str = Query("", description="Filter by department (singular legacy)"),
    departments: Optional[List[str]] = Query(None, description="Filter by departments (multi-select)"),
    exclude_departments: Optional[List[str]] = Query(None, description="Exclude departments"),
    location: str = Query("", description="Filter by location (singular legacy)"),
    locations: Optional[List[str]] = Query(None, description="Filter by locations (multi-select)"),
    exclude_locations: Optional[List[str]] = Query(None, description="Exclude locations"),
    min_salary: Optional[str] = Query(None, description="Minimum salary threshold"),
    max_salary: Optional[str] = Query(None, description="Maximum salary threshold"),
    job_grade: str = Query("", description="Filter by job grade (singular legacy)"),
    job_grades: Optional[List[str]] = Query(None, description="Filter by job grades (multi-select)"),
    exclude_job_grades: Optional[List[str]] = Query(None, description="Exclude job grades"),
    role_type: str = Query("", description="Filter by type of role (singular legacy)"),
    role_types: Optional[List[str]] = Query(None, description="Filter by role types (multi-select)"),
    exclude_role_types: Optional[List[str]] = Query(None, description="Exclude role types"),
    working_pattern: str = Query("", description="Filter by working pattern (singular legacy)"),
    working_patterns: Optional[List[str]] = Query(None, description="Filter by working patterns (multi-select)"),
    exclude_working_patterns: Optional[List[str]] = Query(None, description="Exclude working patterns"),
    contract_type: str = Query("", description="Filter by contract type (singular legacy)"),
    contract_types: Optional[List[str]] = Query(None, description="Filter by contract types (multi-select)"),
    exclude_contract_types: Optional[List[str]] = Query(None, description="Exclude contract types"),
    number_of_jobs: str = Query("", description="Filter by number of jobs/posts"),
    only_new_today: bool = Query(False, description="Filter to jobs first detected today"),
    limit: int = Query(24, ge=1, le=100),
    offset: int = Query(0, ge=0),
    sort_by: str = Query("first_seen_at", description="Field to sort by"),
    sort_order: str = Query("desc", description="Sort order: asc or desc")
):
    """Retrieve filtered and paginated job postings with multi-facet inclusion and exclusion support."""
    parsed_min_salary = _safe_int(min_salary)
    parsed_max_salary = _safe_int(max_salary)

    jobs = database.get_jobs(
        search=search,
        department=department,
        departments=departments,
        exclude_departments=exclude_departments,
        location=location,
        locations=locations,
        exclude_locations=exclude_locations,
        min_salary=parsed_min_salary,
        max_salary=parsed_max_salary,
        job_grade=job_grade,
        job_grades=job_grades,
        exclude_job_grades=exclude_job_grades,
        role_type=role_type,
        role_types=role_types,
        exclude_role_types=exclude_role_types,
        working_pattern=working_pattern,
        working_patterns=working_patterns,
        exclude_working_patterns=exclude_working_patterns,
        contract_type=contract_type,
        contract_types=contract_types,
        exclude_contract_types=exclude_contract_types,
        number_of_jobs=number_of_jobs,
        only_new_today=only_new_today,
        limit=limit,
        offset=offset,
        sort_by=sort_by,
        sort_order=sort_order
    )
    total = database.count_jobs(
        search=search,
        department=department,
        departments=departments,
        exclude_departments=exclude_departments,
        location=location,
        locations=locations,
        exclude_locations=exclude_locations,
        min_salary=parsed_min_salary,
        max_salary=parsed_max_salary,
        job_grade=job_grade,
        job_grades=job_grades,
        exclude_job_grades=exclude_job_grades,
        role_type=role_type,
        role_types=role_types,
        exclude_role_types=exclude_role_types,
        working_pattern=working_pattern,
        working_patterns=working_patterns,
        exclude_working_patterns=exclude_working_patterns,
        contract_type=contract_type,
        contract_types=contract_types,
        exclude_contract_types=exclude_contract_types,
        number_of_jobs=number_of_jobs,
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
    sync_to_live: bool = True


@app.post("/api/scrape")
async def trigger_scrape(request: ScrapeRequest, background_tasks: BackgroundTasks):
    """Trigger an on-demand scraper run."""
    global active_scrape_state
    if config.IS_VERCEL:
        return {
            "status": "disabled",
            "message": "Live background scraping is disabled on Vercel Serverless Functions due to execution timeouts (10s limit). Please run scrapes locally (python main.py scrape) or via scheduled GitHub Actions."
        }

    if active_scrape_state["is_running"]:
        return {"status": "busy", "message": "A scrape run is already in progress."}

    background_tasks.add_task(_run_scraper_task, request.mode, request.max_pages, request.sync_to_live)
    return {"status": "started", "mode": request.mode, "max_pages": request.max_pages, "sync_to_live": request.sync_to_live}



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
    if config.IS_VERCEL:
        return {
            "status": "disabled",
            "message": "Live vacancy enrichment is disabled on Vercel Serverless Functions due to execution timeouts. Please run enrichment locally (python main.py enrich) or on persistent servers."
        }

    if active_enrich_state["is_running"]:
        return {"status": "busy", "message": "Enrichment is already in progress."}

    background_tasks.add_task(_run_enrichment_task, request.limit, request.max_workers)
    return {"status": "started", "limit": request.limit}


@app.get("/api/enrich/status")
async def get_enrich_status():
    """Check status of job enrichment."""
    return active_enrich_state


# ==========================================
# Live Data Sync Endpoints (Direct push without Git)
# ==========================================

class SyncJobsRequest(BaseModel):
    jobs: List[Dict[str, Any]]
    source: Optional[str] = "scraper_cli"
    mode: Optional[str] = "today"


def _verify_sync_token(x_sync_token: Optional[str] = Header(None), authorization: Optional[str] = Header(None)):
    """Validate sync token from X-Sync-Token or Bearer Authorization header."""
    configured_key = config.SYNC_API_KEY or os.getenv("SYNC_API_KEY", "")
    if not configured_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server sync API key (SYNC_API_KEY) is not configured in production environment variables."
        )

    provided = None
    if x_sync_token:
        provided = x_sync_token.strip()
    elif authorization and authorization.startswith("Bearer "):
        provided = authorization[7:].strip()

    if not provided or not secrets.compare_digest(provided, configured_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: Invalid or missing sync authentication token."
        )


@app.post("/api/sync/jobs")
async def sync_incoming_jobs(request: SyncJobsRequest, _auth: None = Depends(_verify_sync_token)):
    """
    Receive newly scraped jobs and sync directly into production database.
    Does not require Git push or Vercel redeployment.
    """
    if not request.jobs:
        return {
            "status": "success",
            "message": "No jobs provided in sync payload.",
            "synced_count": 0,
            "total_jobs_in_catalog": database.count_jobs(),
            "timestamp": datetime.now().isoformat()
        }

    try:
        res = database.sync_live_jobs(request.jobs)
        return {
            "status": "success",
            "message": f"Successfully synced {res['received']} jobs to live catalog.",
            "synced_count": res["received"],
            "inserted": res["inserted"],
            "updated": res["updated"],
            "total_jobs_in_catalog": res["total_jobs_in_catalog"],
            "source": request.source,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to sync jobs to live: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to sync jobs into live storage: {str(e)}"
        )


@app.get("/api/sync/status")
async def get_sync_status():
    """Check sync endpoint readiness and configuration status."""
    is_configured = bool(config.SYNC_API_KEY or os.getenv("SYNC_API_KEY"))
    synced_file_exists = config.SYNCED_JOBS_DB_PATH.exists()
    synced_file_size = config.SYNCED_JOBS_DB_PATH.stat().st_size if synced_file_exists else 0

    return {
        "sync_enabled": is_configured,
        "is_vercel": config.IS_VERCEL,
        "synced_db_active": synced_file_exists and synced_file_size > 0,
        "synced_db_bytes": synced_file_size,
        "total_jobs": database.count_jobs(),
        "new_jobs_today": database.get_dashboard_stats()["new_jobs_today"]
    }


# ==========================================
# User Authentication & Profile Endpoints
# ==========================================


async def get_current_user(
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
) -> Dict:
    """Validate Bearer authorization header or session cookie."""
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
    elif session_token:
        token = session_token

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in."
        )

    user = database.get_user_by_session(token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session has expired. Please log in again."
        )

    user["token"] = token
    return user


async def get_optional_user(
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
) -> Optional[Dict]:
    """Retrieve current authenticated user if session exists, else None."""
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
    elif session_token:
        token = session_token

    if not token:
        return None

    user = database.get_user_by_session(token)
    if user:
        user["token"] = token
    return user


class LoginRequest(BaseModel):
    username_or_email: str
    password: str


class PreferencesUpdateRequest(BaseModel):
    locations: Optional[List[str]] = []
    min_salary: Optional[int] = None
    max_salary: Optional[int] = None
    job_grade: Optional[str] = ""
    role_type: Optional[str] = ""
    working_pattern: Optional[str] = ""
    contract_type: Optional[str] = ""


@app.post("/api/auth/register")
async def register(
    response: Response,
    username: str = Form(...),
    email: str = Form(...),
    password: str = Form(...),
    resume: Optional[UploadFile] = File(None),
    resume_description: Optional[str] = Form("Primary Resume")
):
    """Register a new user account with optional initial resume upload."""
    resume_payload = None
    if resume and hasattr(resume, "filename") and resume.filename:
        content = await resume.read()
        if len(content) > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Resume file exceeds 5MB limit.")
        resume_payload = {
            "filename": resume.filename,
            "description": resume_description or "Primary Resume",
            "content": content,
            "content_type": getattr(resume, "content_type", "application/pdf") or "application/pdf"
        }

    try:
        user = database.create_user(
            username=username,
            email=email,
            password=password,
            resume_file=resume_payload
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    token = database.create_session(user["id"])
    response.set_cookie(key="session_token", value=token, max_age=30 * 86400, samesite="lax")
    user["resume_count"] = 1 if resume_payload else 0

    return {
        "status": "success",
        "message": "Account created successfully.",
        "token": token,
        "user": user
    }


@app.post("/api/auth/login")
async def login(request: LoginRequest, response: Response):
    """Authenticate user and establish session token."""
    user = database.authenticate_user(request.username_or_email, request.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid username/email or password."
        )

    token = database.create_session(user["id"])
    response.set_cookie(key="session_token", value=token, max_age=30 * 86400, samesite="lax")

    # Fetch resume count
    resumes = database.get_user_resumes(user["id"])
    user["resume_count"] = len(resumes)

    return {
        "status": "success",
        "message": "Logged in successfully.",
        "token": token,
        "user": user
    }


@app.post("/api/auth/logout")
async def logout(response: Response, user: Dict = Depends(get_current_user)):
    """Terminate current user session."""
    database.delete_session(user["token"])
    response.delete_cookie(key="session_token")
    return {"status": "success", "message": "Logged out successfully."}


@app.get("/api/auth/me")
async def get_me(user: Dict = Depends(get_current_user)):
    """Fetch current logged-in user profile and preferences."""
    return {"status": "success", "user": user}


@app.get("/api/profile/resumes")
async def list_resumes(user: Dict = Depends(get_current_user)):
    """List all resumes uploaded by the current user."""
    resumes = database.get_user_resumes(user["id"])
    return {"resumes": resumes}


@app.post("/api/profile/resumes")
async def upload_resume(
    file: UploadFile = File(...),
    description: str = Form("My Resume"),
    is_primary: bool = Form(False),
    user: Dict = Depends(get_current_user)
):
    """Upload a new resume with a specific description (e.g. 'Software Engineer CV')."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file selected.")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Resume file exceeds 5MB limit.")

    res = database.add_user_resume(
        user_id=user["id"],
        filename=file.filename,
        description=description.strip() or "My Resume",
        file_content=content,
        content_type=file.content_type or "application/pdf",
        is_primary=is_primary
    )

    return {"status": "success", "message": "Resume uploaded successfully.", "resume": res}


@app.get("/api/profile/resumes/{resume_id}/download")
async def download_resume(resume_id: int, user: Dict = Depends(get_current_user)):
    """Download a stored resume file."""
    record = database.get_resume_by_id(resume_id, user["id"])
    if not record:
        raise HTTPException(status_code=404, detail="Resume not found.")

    headers = {
        "Content-Disposition": f'attachment; filename="{record["filename"]}"'
    }
    return Response(
        content=record["file_content"],
        media_type=record["content_type"] or "application/octet-stream",
        headers=headers
    )


@app.delete("/api/profile/resumes/{resume_id}")
async def delete_resume(resume_id: int, user: Dict = Depends(get_current_user)):
    """Delete a resume."""
    success = database.delete_user_resume(resume_id, user["id"])
    if not success:
        raise HTTPException(status_code=404, detail="Resume not found.")
    return {"status": "success", "message": "Resume deleted successfully."}


@app.put("/api/profile/resumes/{resume_id}/primary")
async def set_primary(resume_id: int, user: Dict = Depends(get_current_user)):
    """Set resume as primary."""
    success = database.set_primary_resume(resume_id, user["id"])
    if not success:
        raise HTTPException(status_code=404, detail="Resume not found.")
    return {"status": "success", "message": "Primary resume updated."}


@app.get("/api/profile/preferences")
async def get_preferences(user: Dict = Depends(get_current_user)):
    """Fetch user's job search preferences."""
    return {"preferences": user.get("preferences", {})}


@app.put("/api/profile/preferences")
async def save_preferences(
    payload: PreferencesUpdateRequest,
    user: Dict = Depends(get_current_user)
):
    """Save user's job preferences (locations, salary scale, roles, etc.)."""
    updated = database.update_user_preferences(user["id"], payload.dict())
    return {"status": "success", "message": "Preferences saved successfully.", "preferences": updated}


@app.get("/api/profile/saved-jobs")
async def get_saved_jobs(user: Dict = Depends(get_current_user)):
    """Fetch list of bookmarked job reference numbers for the current user."""
    refs = database.get_user_saved_job_references(user["id"])
    return {"saved_job_references": refs}


@app.post("/api/profile/saved-jobs/{job_ref}")
async def bookmark_job(
    job_ref: str,
    notes: str = Query("", description="Optional personal notes"),
    user: Dict = Depends(get_current_user)
):
    """Bookmark a job for the current user in the isolated user store."""
    database.save_user_job_bookmark(user["id"], job_ref, notes)
    return {"status": "success", "message": "Job bookmarked.", "job_reference": job_ref}


@app.delete("/api/profile/saved-jobs/{job_ref}")
async def remove_bookmark(job_ref: str, user: Dict = Depends(get_current_user)):
    """Remove a bookmarked job for the current user."""
    database.remove_user_job_bookmark(user["id"], job_ref)
    return {"status": "success", "message": "Bookmark removed.", "job_reference": job_ref}


# ==========================================
# Application Studio & AI Tailoring Endpoints
# ==========================================

def _format_cv_inline(text: str) -> str:
    escaped = html_escape(text)
    escaped = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', escaped)
    escaped = re.sub(r'\*(.*?)\*', r'<em>\1</em>', escaped)
    escaped = re.sub(r'<u>(.*?)</u>', r'<u>\1</u>', escaped)
    return escaped


def convert_text_to_cv_html(text: str) -> str:
    """Converts structured text or markdown to clean semantic CV HTML."""
    if not text:
        return ""
    lines = text.split("\n")
    html_lines = []
    in_list = False

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            if in_list:
                html_lines.append("</ul>")
                in_list = False
            continue

        if line.startswith("# "):
            if in_list:
                html_lines.append("</ul>")
                in_list = False
            html_lines.append(f"<h1>{_format_cv_inline(line[2:])}</h1>")
        elif line.startswith("## "):
            if in_list:
                html_lines.append("</ul>")
                in_list = False
            html_lines.append(f"<h2>{_format_cv_inline(line[3:])}</h2>")
        elif line.startswith("### "):
            if in_list:
                html_lines.append("</ul>")
                in_list = False
            html_lines.append(f"<h3>{_format_cv_inline(line[4:])}</h3>")
        elif line.startswith("- ") or line.startswith("* ") or line.startswith("• "):
            if not in_list:
                html_lines.append("<ul>")
                in_list = True
            html_lines.append(f"<li>{_format_cv_inline(line[2:])}</li>")
        elif re.match(r'^\d+\.\s+', line):
            if in_list:
                html_lines.append("</ul>")
                in_list = False
            content = re.sub(r'^\d+\.\s+', '', line)
            html_lines.append(f"<li>{_format_cv_inline(content)}</li>")
        elif line.isupper() and len(line) < 60 and not line.endswith("."):
            if in_list:
                html_lines.append("</ul>")
                in_list = False
            html_lines.append(f"<h2>{_format_cv_inline(line)}</h2>")
        elif line.endswith(":") and len(line) < 60:
            if in_list:
                html_lines.append("</ul>")
                in_list = False
            html_lines.append(f"<h3>{_format_cv_inline(line)}</h3>")
        else:
            if in_list:
                html_lines.append("</ul>")
                in_list = False
            html_lines.append(f"<p>{_format_cv_inline(line)}</p>")

    if in_list:
        html_lines.append("</ul>")

    return "\n".join(html_lines)


def extract_document_content(content: Any, filename: str) -> Dict[str, Any]:
    """
    Extract structured text and semantic HTML from PDF, Word (.docx, .doc), or text files.
    Preserves document structure (headings, bold, lists, paragraphs, tables) so it can be viewed and edited natively.
    """
    if isinstance(content, memoryview):
        raw_bytes = bytes(content)
    elif isinstance(content, str):
        raw_bytes = content.encode("utf-8", errors="ignore")
    elif isinstance(content, (bytes, bytearray)):
        raw_bytes = bytes(content)
    else:
        raw_bytes = b""

    ext = os.path.splitext(filename)[1].lower()
    doc_type = ext.lstrip(".") or "txt"
    plain_text = ""
    html_content = ""
    error = None

    if ext == ".pdf":
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(raw_bytes))
            page_texts = []
            page_htmls = []
            for i, page in enumerate(reader.pages):
                t = (page.extract_text() or "").strip()
                if t:
                    page_texts.append(t)
                    page_htmls.append(f"<div class='pdf-page' data-page='{i+1}'>" + convert_text_to_cv_html(t) + "</div>")
            plain_text = "\n\n".join(page_texts).strip()
            html_content = "\n<div class='pdf-page-divider'></div>\n".join(page_htmls).strip()
        except Exception as e:
            logger.warning(f"pypdf extraction failed for {filename}: {e}")
            error = str(e)
            try:
                matches = re.findall(r'[A-Za-z0-9 ,.\-_;:\(\)\/]{4,}', raw_bytes.decode("latin-1", errors="ignore"))
                plain_text = "\n".join(matches[:250]).strip()
                html_content = convert_text_to_cv_html(plain_text)
            except Exception:
                plain_text = ""
                html_content = ""

    elif ext in [".docx", ".doc"]:
        try:
            import docx
            doc = docx.Document(io.BytesIO(raw_bytes))
            p_texts = []
            html_parts = []
            for p in doc.paragraphs:
                p_text = p.text.strip()
                if not p_text:
                    continue
                p_texts.append(p_text)

                style_name = (p.style.name if p.style else "").lower()
                tag = "p"
                if "heading 1" in style_name or "title" in style_name:
                    tag = "h1"
                elif "heading 2" in style_name:
                    tag = "h2"
                elif "heading 3" in style_name:
                    tag = "h3"
                elif "list" in style_name or "bullet" in style_name:
                    tag = "li"

                # Extract formatted runs (bold, italic, underline)
                run_htmls = []
                for run in p.runs:
                    txt = html_escape(run.text)
                    if not txt:
                        continue
                    if run.bold:
                        txt = f"<strong>{txt}</strong>"
                    if run.italic:
                        txt = f"<em>{txt}</em>"
                    if run.underline:
                        txt = f"<u>{txt}</u>"
                    run_htmls.append(txt)

                inner = "".join(run_htmls) or html_escape(p_text)
                if tag == "li":
                    html_parts.append(f"<li>{inner}</li>")
                else:
                    html_parts.append(f"<{tag}>{inner}</{tag}>")

            for table in doc.tables:
                html_parts.append("<table class='cv-table'>")
                for row in table.rows:
                    html_parts.append("<tr>")
                    for cell in row.cells:
                        c_text = cell.text.strip()
                        if c_text:
                            p_texts.append(c_text)
                        html_parts.append(f"<td>{html_escape(c_text)}</td>")
                    html_parts.append("</tr>")
                html_parts.append("</table>")

            plain_text = "\n\n".join(p_texts).strip()
            html_content = "\n".join(html_parts).strip()
        except Exception as e:
            logger.warning(f"docx extraction failed for {filename}: {e}")
            error = str(e)
            try:
                plain_text = raw_bytes.decode("utf-8", errors="ignore")
            except Exception:
                plain_text = raw_bytes.decode("latin-1", errors="ignore")
            html_content = convert_text_to_cv_html(plain_text)
    else:
        try:
            plain_text = raw_bytes.decode("utf-8")
        except UnicodeDecodeError:
            plain_text = raw_bytes.decode("latin-1", errors="ignore")
        html_content = convert_text_to_cv_html(plain_text)

    if not html_content and plain_text:
        html_content = convert_text_to_cv_html(plain_text)

    return {
        "text": plain_text,
        "html": html_content,
        "doc_type": doc_type,
        "file_type": doc_type,
        "error": error
    }


def extract_text_from_file_bytes(content: Any, filename: str) -> str:
    """Backward compatibility helper for plain text extraction."""
    res = extract_document_content(content, filename)
    return res.get("text") or ""


class AIAnalyzeRequest(BaseModel):
    cv_text: str
    job_data: Dict
    api_key: Optional[str] = None
    provider: Optional[str] = "openai"


class AIQuestionRequest(BaseModel):
    keyword: str
    category: str
    job_title: str
    api_key: Optional[str] = None
    provider: Optional[str] = "openai"


class AIIntegrateRequest(BaseModel):
    keyword: str
    user_experience: str
    cv_text: str
    job_title: str
    api_key: Optional[str] = None
    provider: Optional[str] = "openai"


class AIPersonalStatementRequest(BaseModel):
    cv_text: str
    job_data: Dict
    target_words: Optional[int] = 750
    focus_behaviours: Optional[List[str]] = None
    api_key: Optional[str] = None
    provider: Optional[str] = "openai"


class AICoverLetterRequest(BaseModel):
    cv_text: str
    job_data: Dict
    api_key: Optional[str] = None
    provider: Optional[str] = "openai"


@app.get("/api/jobs/{ref_code}/full-advert")
async def get_full_job_advert(ref_code: str, user: Optional[Dict] = Depends(get_optional_user)):
    """Fetch complete job posting details, advert description, and user's primary CV text."""
    job = database.get_job_by_reference(ref_code)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    # Scrape full advert body from civil service portal
    scraper = CivilServiceScraper()
    advert_data = scraper.fetch_full_job_advert(job.get("job_url", ""))

    combined = dict(job)
    combined.update(advert_data)

    initial_cv_text = DEFAULT_CV_TEMPLATE
    initial_cv_html = convert_text_to_cv_html(DEFAULT_CV_TEMPLATE)
    user_has_custom_cv = False
    active_resume_name = None
    active_resume_type = "template"
    active_resume_id = None
    user_resumes_list = []

    if user:
        user_resumes_list = database.get_user_resumes(user["id"])
        primary_resume = database.get_primary_resume_record(user["id"])
        if primary_resume and primary_resume.get("file_content"):
            parsed = extract_document_content(
                primary_resume["file_content"],
                primary_resume.get("filename", "resume.pdf")
            )
            if parsed["text"] and len(parsed["text"].strip()) > 20:
                initial_cv_text = parsed["text"]
                initial_cv_html = parsed["html"]
                user_has_custom_cv = True
                active_resume_name = primary_resume.get("filename")
                active_resume_type = parsed["doc_type"]
                active_resume_id = primary_resume["id"]

    return {
        "status": "success",
        "job": combined,
        "default_cv_template": DEFAULT_CV_TEMPLATE,
        "initial_cv_text": initial_cv_text,
        "initial_cv_html": initial_cv_html,
        "user_has_custom_cv": user_has_custom_cv,
        "active_resume_name": active_resume_name,
        "active_resume_type": active_resume_type,
        "active_resume_id": active_resume_id,
        "active_resume_raw_url": f"/api/profile/resumes/{active_resume_id}/raw" if active_resume_id else None,
        "user_resumes": user_resumes_list,
        "user": {"id": user["id"], "username": user["username"], "email": user["email"]} if user else None
    }


@app.post("/api/ai/analyze")
async def analyze_cv(request: AIAnalyzeRequest):
    """Analyze CV against job advert keywords and compute ATS score."""
    analysis = ai_service.analyze_cv_keywords(
        cv_text=request.cv_text,
        job_data=request.job_data,
        api_key=request.api_key,
        provider=request.provider or "openai"
    )
    return {"status": "success", "analysis": analysis}


@app.post("/api/ai/ask-keyword-question")
async def ask_keyword_question(request: AIQuestionRequest):
    """Generate interactive clarification question asking the candidate about a missing keyword."""
    res = ai_service.generate_keyword_question(
        keyword=request.keyword,
        category=request.category,
        job_title=request.job_title,
        api_key=request.api_key,
        provider=request.provider or "openai"
    )
    return {"status": "success", "result": res}


@app.post("/api/ai/integrate-keyword")
async def integrate_keyword(request: AIIntegrateRequest):
    """Synthesize candidate's response into a tailored, humanized CV bullet point and placement recommendation."""
    res = ai_service.integrate_keyword_suggestion(
        keyword=request.keyword,
        user_experience=request.user_experience,
        cv_text=request.cv_text,
        job_title=request.job_title,
        api_key=request.api_key,
        provider=request.provider or "openai"
    )
    return {"status": "success", "suggestion": res}


@app.post("/api/ai/personal-statement")
async def generate_statement(request: AIPersonalStatementRequest):
    """Generate Civil Service Success Profiles Personal Statement."""
    res = ai_service.generate_personal_statement(
        cv_text=request.cv_text,
        job_data=request.job_data,
        target_words=request.target_words or 750,
        focus_behaviours=request.focus_behaviours,
        api_key=request.api_key,
        provider=request.provider or "openai"
    )
    return {"status": "success", "result": res}


@app.post("/api/ai/cover-letter")
async def generate_letter(request: AICoverLetterRequest):
    """Generate tailored UK Civil Service cover letter."""
    res = ai_service.generate_cover_letter(
        cv_text=request.cv_text,
        job_data=request.job_data,
        api_key=request.api_key,
        provider=request.provider or "openai"
    )
    return {"status": "success", "result": res}


@app.post("/api/cv/extract-text")
async def extract_cv_text(
    file: UploadFile = File(...),
    user: Optional[Dict] = Depends(get_optional_user)
):
    """Upload a PDF, Word, or text file and extract text and formatted HTML directly for the studio editor."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded.")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File exceeds 10MB limit.")

    doc_data = extract_document_content(content, file.filename)

    saved = False
    resume_id = None
    if user:
        try:
            res_record = database.add_user_resume(
                user_id=user["id"],
                filename=file.filename,
                description=f"Studio Upload ({file.filename})",
                file_content=content,
                content_type=file.content_type or "application/pdf",
                is_primary=True
            )
            saved = True
            resume_id = res_record.get("id")
        except Exception:
            pass

    return {
        "status": "success",
        "filename": file.filename,
        "text": doc_data["text"],
        "html": doc_data["html"],
        "file_type": doc_data["doc_type"],
        "raw_url": f"/api/profile/resumes/{resume_id}/raw" if resume_id else None,
        "saved_to_profile": saved
    }


@app.get("/api/profile/resumes/{resume_id}/content")
@app.get("/api/profile/resumes/{resume_id}/text")
async def get_resume_content(resume_id: int, user: Dict = Depends(get_current_user)):
    """Fetch text, rich HTML, and metadata of a specific uploaded resume for the studio editor."""
    record = database.get_resume_by_id(resume_id, user["id"])
    if not record or not record.get("file_content"):
        raise HTTPException(status_code=404, detail="Resume not found.")

    filename = record.get("filename", "resume.pdf")
    parsed = extract_document_content(record["file_content"], filename)
    return {
        "status": "success",
        "id": record["id"],
        "filename": filename,
        "file_type": parsed["doc_type"],
        "text": parsed["text"],
        "html": parsed["html"],
        "raw_url": f"/api/profile/resumes/{record['id']}/raw"
    }


@app.get("/api/profile/resumes/{resume_id}/raw")
async def get_resume_raw(resume_id: int, user: Optional[Dict] = Depends(get_optional_user)):
    """Serve the raw stored resume file inline (for PDF.js, iframe preview, or direct viewing)."""
    record = None
    if user:
        record = database.get_resume_by_id(resume_id, user["id"])
    if not record:
        with database.get_users_db_connection() as conn:
            c = conn.cursor()
            c.execute("SELECT * FROM user_resumes WHERE id = ?", (resume_id,))
            r = c.fetchone()
            if r:
                record = dict(r)

    if not record or not record.get("file_content"):
        raise HTTPException(status_code=404, detail="Resume not found.")

    filename = record.get("filename", "resume")
    ext = os.path.splitext(filename)[1].lower()
    content_type = "application/octet-stream"
    if ext == ".pdf":
        content_type = "application/pdf"
    elif ext == ".docx":
        content_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    elif ext == ".doc":
        content_type = "application/msword"
    elif ext in [".txt", ".md"]:
        content_type = "text/plain; charset=utf-8"

    return Response(
        content=record["file_content"],
        media_type=content_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'}
    )


class ExportDocxRequest(BaseModel):
    html: Optional[str] = None
    cv_html: Optional[str] = None
    filename: Optional[str] = "Tailored_Civil_Service_CV.docx"


@app.post("/api/cv/export-docx")
async def export_cv_docx(request: ExportDocxRequest):
    """Generate a clean, styled Microsoft Word .docx file from the editor HTML."""
    try:
        from bs4 import BeautifulSoup
        import docx
        from docx.shared import Pt, Inches

        doc = docx.Document()

        # Set standard margins (0.75 in / ~1.9cm)
        for section in doc.sections:
            section.top_margin = Inches(0.75)
            section.bottom_margin = Inches(0.75)
            section.left_margin = Inches(0.75)
            section.right_margin = Inches(0.75)

        raw_html = request.html or request.cv_html or "<p>Civil Service Tailored CV</p>"
        soup = BeautifulSoup(raw_html, "html.parser")

        for element in soup.children:
            if not getattr(element, "name", None):
                text = str(element).strip()
                if text:
                    doc.add_paragraph(text)
                continue

            tag = element.name.lower()
            text = element.get_text().strip()
            if not text:
                continue

            if tag == "h1":
                h = doc.add_heading(text, level=0)
                h.paragraph_format.space_after = Pt(4)
            elif tag == "h2":
                h = doc.add_heading(text, level=1)
                h.paragraph_format.space_before = Pt(12)
                h.paragraph_format.space_after = Pt(4)
            elif tag == "h3":
                h = doc.add_heading(text, level=2)
                h.paragraph_format.space_before = Pt(8)
                h.paragraph_format.space_after = Pt(2)
            elif tag == "ul":
                for li in element.find_all("li", recursive=False):
                    li_txt = li.get_text().strip()
                    if li_txt:
                        p = doc.add_paragraph(style='List Bullet')
                        p.paragraph_format.space_after = Pt(2)
                        for child in li.children:
                            if isinstance(child, str):
                                p.add_run(str(child))
                            elif getattr(child, 'name', None):
                                r = p.add_run(child.get_text())
                                if child.name in ['strong', 'b']:
                                    r.bold = True
                                elif child.name in ['em', 'i']:
                                    r.italic = True
            elif tag == "ol":
                for li in element.find_all("li", recursive=False):
                    li_txt = li.get_text().strip()
                    if li_txt:
                        p = doc.add_paragraph(style='List Number')
                        p.paragraph_format.space_after = Pt(2)
                        p.add_run(li_txt)
            elif tag == "table":
                rows = element.find_all("tr")
                if rows:
                    cols_count = max(len(r.find_all(["td", "th"])) for r in rows)
                    table = doc.add_table(rows=len(rows), cols=cols_count)
                    table.style = 'Table Grid'
                    for r_idx, row in enumerate(rows):
                        cells = row.find_all(["td", "th"])
                        for c_idx, cell in enumerate(cells):
                            table.cell(r_idx, c_idx).text = cell.get_text().strip()
            else:
                p = doc.add_paragraph()
                p.paragraph_format.space_after = Pt(4)
                for child in element.children:
                    if isinstance(child, str):
                        p.add_run(str(child))
                    elif getattr(child, 'name', None):
                        r = p.add_run(child.get_text())
                        if child.name in ['strong', 'b']:
                            r.bold = True
                        elif child.name in ['em', 'i']:
                            r.italic = True

        buf = io.BytesIO()
        doc.save(buf)
        buf.seek(0)
        out_filename = request.filename or "Tailored_Civil_Service_CV.docx"
        if not out_filename.endswith(".docx"):
            out_filename += ".docx"

        return Response(
            content=buf.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{out_filename}"'}
        )
    except Exception as e:
        logger.error(f"Docx export error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to export Word document: {str(e)}")


@app.get("/api/cv/default-template")
async def get_default_cv_template():
    """Retrieve default Civil Service CV markdown template."""
    return {"template": DEFAULT_CV_TEMPLATE}

