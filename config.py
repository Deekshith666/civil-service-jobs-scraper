"""Configuration settings for Civil Service Jobs Scraper."""

import os
import shutil
from pathlib import Path

# Base Paths
PROJECT_DIR = Path(__file__).resolve().parent
BUNDLED_DATA_DIR = PROJECT_DIR / "data"
BUNDLED_DB_PATH = BUNDLED_DATA_DIR / "jobs.db"

# Environment Detection (Vercel Serverless / AWS Lambda)
IS_VERCEL = bool(os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"))

if IS_VERCEL:
    # On Vercel, the application bundle (/var/task) is mounted strictly read-only.
    # The only writable directory is /tmp.
    DATA_DIR = Path("/tmp/civil_service_data")
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    DB_PATH = DATA_DIR / "jobs.db"

    # Seed the writable /tmp database from the bundled jobs.db on cold start
    if BUNDLED_DB_PATH.exists() and (not DB_PATH.exists() or DB_PATH.stat().st_size == 0):
        try:
            shutil.copyfile(BUNDLED_DB_PATH, DB_PATH)
        except Exception:
            # Fallback to bundled DB in case copying fails
            DB_PATH = BUNDLED_DB_PATH
else:
    DATA_DIR = BUNDLED_DATA_DIR
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    DB_PATH = DATA_DIR / "jobs.db"

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

