"""FastAPI web application to display scraped Civil Service jobs and control scraping runs."""

import os
import io
from typing import Dict, List, Optional
from fastapi import (
    FastAPI, BackgroundTasks, Query, Depends, HTTPException,
    Header, Cookie, Request, Response, UploadFile, File, Form, status
)
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse, Response
from pydantic import BaseModel

import config
import database
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
    department: str = Query("", description="Filter by department"),
    location: str = Query("", description="Filter by location"),
    min_salary: Optional[str] = Query(None, description="Minimum salary threshold"),
    max_salary: Optional[str] = Query(None, description="Maximum salary threshold"),
    job_grade: str = Query("", description="Filter by job grade"),
    role_type: str = Query("", description="Filter by type of role"),
    working_pattern: str = Query("", description="Filter by working pattern"),
    contract_type: str = Query("", description="Filter by contract type"),
    number_of_jobs: str = Query("", description="Filter by number of jobs/posts"),
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
        location=location,
        min_salary=parsed_min_salary,
        max_salary=parsed_max_salary,
        job_grade=job_grade,
        role_type=role_type,
        working_pattern=working_pattern,
        contract_type=contract_type,
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

def extract_text_from_file_bytes(content: bytes, filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    if ext == ".pdf":
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(content))
            pages_text = [p.extract_text() or "" for p in reader.pages]
            return "\n\n".join(pages_text).strip()
        except Exception as e:
            return f"Error reading PDF: {e}"
    elif ext in [".docx", ".doc"]:
        try:
            import docx
            doc = docx.Document(io.BytesIO(content))
            return "\n\n".join([p.text for p in doc.paragraphs if p.text.strip()]).strip()
        except Exception as e:
            return f"Error reading Word document: {e}"
    else:
        try:
            return content.decode("utf-8")
        except UnicodeDecodeError:
            return content.decode("latin-1", errors="ignore")


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
    user_has_custom_cv = False
    active_resume_name = None
    user_resumes_list = []

    if user:
        user_resumes_list = database.get_user_resumes(user["id"])
        primary_resume = database.get_primary_resume_record(user["id"])
        if primary_resume and primary_resume.get("file_content"):
            extracted = extract_text_from_file_bytes(
                primary_resume["file_content"],
                primary_resume.get("filename", "resume.pdf")
            )
            if extracted and len(extracted.strip()) > 20:
                initial_cv_text = extracted
                user_has_custom_cv = True
                active_resume_name = primary_resume.get("filename")

    return {
        "status": "success",
        "job": combined,
        "default_cv_template": DEFAULT_CV_TEMPLATE,
        "initial_cv_text": initial_cv_text,
        "user_has_custom_cv": user_has_custom_cv,
        "active_resume_name": active_resume_name,
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
    """Upload a PDF, Word, or text file and extract text directly for the studio editor."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded.")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File exceeds 10MB limit.")

    text = extract_text_from_file_bytes(content, file.filename)

    saved = False
    if user:
        try:
            database.add_user_resume(
                user_id=user["id"],
                filename=file.filename,
                description=f"Studio Upload ({file.filename})",
                file_content=content,
                content_type=file.content_type or "application/pdf",
                is_primary=True
            )
            saved = True
        except Exception:
            pass

    return {
        "status": "success",
        "filename": file.filename,
        "text": text,
        "saved_to_profile": saved
    }


@app.get("/api/profile/resumes/{resume_id}/text")
async def get_resume_text(resume_id: int, user: Dict = Depends(get_current_user)):
    """Fetch text of a specific uploaded resume for the studio editor."""
    record = database.get_resume_by_id(resume_id, user["id"])
    if not record or not record.get("file_content"):
        raise HTTPException(status_code=404, detail="Resume not found.")

    text = extract_text_from_file_bytes(record["file_content"], record.get("filename", "resume.pdf"))
    return {
        "status": "success",
        "id": record["id"],
        "filename": record["filename"],
        "text": text
    }


@app.get("/api/cv/default-template")
async def get_default_cv_template():
    """Retrieve default Civil Service CV markdown template."""
    return {"template": DEFAULT_CV_TEMPLATE}

