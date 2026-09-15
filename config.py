"""Configuration settings for Civil Service Jobs Scraper."""

from pathlib import Path

# Base Paths
PROJECT_DIR = Path(__file__).resolve().parent
DATA_DIR = PROJECT_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
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

