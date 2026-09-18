"""Configuration settings for Civil Service Jobs Scraper."""

import os
import shutil
from pathlib import Path

# Base Paths
PROJECT_DIR = Path(__file__).resolve().parent
BUNDLED_DATA_DIR = PROJECT_DIR / "data"
BUNDLED_DB_PATH = BUNDLED_DATA_DIR / "jobs.db"
ENV_FILE_PATH = PROJECT_DIR / ".env"

# Auto-load .env file if present
if ENV_FILE_PATH.exists():
    try:
        with open(ENV_FILE_PATH, "r", encoding="utf-8") as _f:
            for _line in _f:
                _line = _line.strip()
                if not _line or _line.startswith("#") or "=" not in _line:
                    continue
                _k, _v = _line.split("=", 1)
                _k = _k.strip()
                _v = _v.strip().strip("'\"")
                if _k and _k not in os.environ:
                    os.environ[_k] = _v
    except Exception:
        pass

# Environment Detection (Vercel Serverless / AWS Lambda)
IS_VERCEL = bool(os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"))


# Cloud Database Connection Options (for permanent Vercel persistence of user data)
DATABASE_URL = os.getenv("DATABASE_URL")
TURSO_DATABASE_URL = os.getenv("TURSO_DATABASE_URL")
TURSO_AUTH_TOKEN = os.getenv("TURSO_AUTH_TOKEN")

if IS_VERCEL:
    # On Vercel, the application bundle (/var/task) is mounted strictly read-only.
    # The only writable directory is /tmp.
    DATA_DIR = Path("/tmp/civil_service_data")
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    
    # 1. Scraped Jobs Catalog: bundled with project, read-only on Vercel
    JOBS_DB_PATH = BUNDLED_DB_PATH
    
    # 2. User Store: isolated in writable storage (or cloud database)
    BUNDLED_USERS_DB_PATH = BUNDLED_DATA_DIR / "users.db"
    USERS_DB_PATH = DATA_DIR / "users.db"

    # Seed or refresh the writable /tmp users database from the bundled users.db
    if BUNDLED_USERS_DB_PATH.exists():
        if not USERS_DB_PATH.exists() or USERS_DB_PATH.stat().st_size == 0 or USERS_DB_PATH.stat().st_size < BUNDLED_USERS_DB_PATH.stat().st_size:
            try:
                shutil.copyfile(BUNDLED_USERS_DB_PATH, USERS_DB_PATH)
            except Exception:
                pass
    
    # Synced jobs database: store live pushed jobs via API
    SYNCED_JOBS_DB_PATH = DATA_DIR / "synced_jobs.db"

    # Backwards compatibility alias
    DB_PATH = JOBS_DB_PATH
else:
    DATA_DIR = BUNDLED_DATA_DIR
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    
    # In local environment, jobs.db is in data/, and users.db is also in data/ (gitignored)
    JOBS_DB_PATH = DATA_DIR / "jobs.db"
    USERS_DB_PATH = DATA_DIR / "users.db"
    SYNCED_JOBS_DB_PATH = DATA_DIR / "synced_jobs.db"
    DB_PATH = JOBS_DB_PATH


# Live Sync API & Security Configuration
SYNC_API_KEY = os.getenv("SYNC_API_KEY", "").strip()
LIVE_APP_URL = (
    os.getenv("LIVE_APP_URL")
    or os.getenv("VERCEL_PROJECT_URL")
    or "https://civil-service-jobs-scraper.vercel.app"
).strip().rstrip("/")


# URLs
BASE_URL = "https://www.civilservicejobs.service.gov.uk"
CSR_INDEX_URL = f"{BASE_URL}/csr/index.cgi"
CSR_CAPTCHA_URL = f"{BASE_URL}/csr/index.cgi?ProtectCaptcha=1"
CSR_SEARCH_ACTION = f"{BASE_URL}/csr/esearch.cgi?SID="

# HTTP Client Config
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)
REQUEST_TIMEOUT = 30  # seconds
REQUEST_DELAY = 1.0   # seconds between pages to respect target server

# Scheduler
DEFAULT_SCHEDULE_HOUR = 8
DEFAULT_SCHEDULE_MINUTE = 0

# Web Dashboard Server
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8090

