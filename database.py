"""Database management for Civil Service Jobs Scraper using SQLite."""

import os
import re
import json
import sqlite3
import logging
import hashlib
import secrets
from pathlib import Path
from datetime import datetime, date, timedelta
from typing import Dict, List, Optional, Set, Tuple
from config import (
    JOBS_DB_PATH,
    USERS_DB_PATH,
    DATABASE_URL,
    TURSO_DATABASE_URL,
    TURSO_AUTH_TOKEN,
    DB_PATH,
)

logger = logging.getLogger(__name__)


def is_jobs_db_writable() -> bool:
    """Check if the configured jobs catalog SQLite database file and directory can be written to."""
    try:
        if JOBS_DB_PATH.exists():
            return os.access(str(JOBS_DB_PATH), os.W_OK) and os.access(str(JOBS_DB_PATH.parent), os.W_OK)
        return os.access(str(JOBS_DB_PATH.parent), os.W_OK)
    except Exception:
        return False


def is_users_db_writable() -> bool:
    """Check if the configured user data store SQLite database file and directory can be written to."""
    try:
        if USERS_DB_PATH.exists():
            return os.access(str(USERS_DB_PATH), os.W_OK) and os.access(str(USERS_DB_PATH.parent), os.W_OK)
        return os.access(str(USERS_DB_PATH.parent), os.W_OK)
    except Exception:
        return False


# Backwards compatibility alias
is_database_writable = is_jobs_db_writable


def parse_salary_range(salary_str: Optional[str]) -> Tuple[Optional[int], Optional[int]]:
    """
    Extract numeric minimum and maximum annual salary (GBP) from salary text.
    Handles formats like:
      - '£30,485' -> (30485, 30485)
      - '£45,544 to £49,523' -> (45544, 49523)
      - '£35,000 - £42,000 p.a.' -> (35000, 42000)
      - '£12.50 per hour' / 'Competitive' -> (None, None)
    """
    if not salary_str:
        return None, None

    cleaned = salary_str.replace(",", "")
    # Find all 4 to 7 digit numbers (annual salary range typically £15,000 - £250,000)
    matches = [int(m) for m in re.findall(r"(?:£\s*|\b)([1-9]\d{3,6})\b", cleaned)]
    # Filter out year numbers like 2024, 2025, 2026, 2027 if they somehow matched
    valid_salaries = [m for m in matches if m < 2000 or m > 2035]

    if not valid_salaries:
        return None, None

    return min(valid_salaries), max(valid_salaries)


def get_jobs_db_connection() -> sqlite3.Connection:
    """
    Create and return a database connection to the scraped jobs catalog.
    Uses immutable URI mode on read-only environments (e.g. Vercel serverless).
    """
    db_file_str = str(JOBS_DB_PATH)

    if not is_jobs_db_writable():
        uri_path = Path(db_file_str).resolve().as_posix()
        conn = sqlite3.connect(f"file:{uri_path}?mode=ro&immutable=1", uri=True)
        conn.row_factory = sqlite3.Row
        return conn

    try:
        conn = sqlite3.connect(db_file_str)
        conn.row_factory = sqlite3.Row
        return conn
    except sqlite3.OperationalError as e:
        if "readonly" in str(e).lower() or "attempt to write" in str(e).lower() or "unable to open" in str(e).lower():
            uri_path = Path(db_file_str).resolve().as_posix()
            conn = sqlite3.connect(f"file:{uri_path}?mode=ro&immutable=1", uri=True)
            conn.row_factory = sqlite3.Row
            return conn
        raise


# Jobs catalog queries default connection
get_db_connection = get_jobs_db_connection


def get_users_db_connection() -> sqlite3.Connection:
    """
    Create and return a connection to the dedicated user data store.
    Completely isolated from the scraped jobs catalog to prevent overwrites.
    """
    try:
        USERS_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass

    conn = sqlite3.connect(str(USERS_DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_jobs_db():
    """Initialize jobs catalog tables and indexes if writable."""
    if not is_jobs_db_writable():
        logger.info("Jobs catalog database is read-only. Skipping jobs schema initialization.")
        return

    try:
        with get_jobs_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS jobs (
                    reference_number TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    department TEXT,
                    location TEXT,
                    salary TEXT,
                    salary_min INTEGER,
                    salary_max INTEGER,
                    job_grade TEXT,
                    role_type TEXT,
                    working_pattern TEXT,
                    contract_type TEXT,
                    closing_date TEXT,
                    job_url TEXT,
                    logo_url TEXT,
                    first_seen_at TEXT NOT NULL,
                    last_scraped_at TEXT NOT NULL
                )
            """)

            cursor.execute("PRAGMA table_info(jobs)")
            existing_cols = {row[1] for row in cursor.fetchall()}
            new_columns = [
                ("salary_min", "INTEGER"),
                ("salary_max", "INTEGER"),
                ("job_grade", "TEXT"),
                ("role_type", "TEXT"),
                ("working_pattern", "TEXT"),
                ("contract_type", "TEXT"),
            ]
            for col_name, col_type in new_columns:
                if col_name not in existing_cols:
                    cursor.execute(f"ALTER TABLE jobs ADD COLUMN {col_name} {col_type}")

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS scrape_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_at TEXT NOT NULL,
                    mode TEXT NOT NULL,
                    pages_scraped INTEGER DEFAULT 0,
                    jobs_found INTEGER DEFAULT 0,
                    new_jobs_added INTEGER DEFAULT 0,
                    duration_seconds REAL DEFAULT 0.0,
                    status TEXT DEFAULT 'success',
                    error_message TEXT
                )
            """)

            cursor.execute("CREATE INDEX IF NOT EXISTS idx_jobs_dept ON jobs(department)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_jobs_first_seen ON jobs(first_seen_at)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_jobs_closing ON jobs(closing_date)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_jobs_salary_min ON jobs(salary_min)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_jobs_salary_max ON jobs(salary_max)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_jobs_grade ON jobs(job_grade)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_jobs_role ON jobs(role_type)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_jobs_contract ON jobs(contract_type)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_jobs_pattern ON jobs(working_pattern)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_logs_run_at ON scrape_logs(run_at)")
            conn.commit()
    except sqlite3.OperationalError as e:
        logger.warning(f"Jobs DB initialization skipped: {e}")


def init_users_db():
    """Initialize dedicated user store tables, resumes, sessions, and preferences."""
    try:
        with get_users_db_connection() as conn:
            cursor = conn.cursor()

            # Users table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    salt TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    preferences_json TEXT DEFAULT '{}'
                )
            """)

            # User Resumes table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_resumes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    filename TEXT NOT NULL,
                    description TEXT NOT NULL,
                    file_content BLOB NOT NULL,
                    file_size INTEGER NOT NULL,
                    content_type TEXT NOT NULL,
                    is_primary INTEGER DEFAULT 0,
                    uploaded_at TEXT NOT NULL
                )
            """)

            # User Sessions table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_sessions (
                    token TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL
                )
            """)

            # User Modifications & Bookmarks table (future-proof user modifications on Vercel)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_saved_jobs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    job_reference TEXT NOT NULL,
                    saved_at TEXT NOT NULL,
                    notes TEXT DEFAULT '',
                    UNIQUE(user_id, job_reference)
                )
            """)

            cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON user_resumes(user_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(token)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_saved_jobs_user ON user_saved_jobs(user_id)")
            conn.commit()
    except Exception as e:
        logger.error(f"Error initializing users database: {e}")


def init_db():
    """Initialize both jobs catalog and user store schemas."""
    init_jobs_db()
    init_users_db()



def backfill_salary_ranges():
    """Calculate and store salary_min and salary_max for jobs with raw salary text."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT reference_number, salary FROM jobs WHERE salary IS NOT NULL AND salary != '' AND (salary_min IS NULL OR salary_max IS NULL)")
        rows = cursor.fetchall()
        
        updated = 0
        for ref, sal_text in rows:
            s_min, s_max = parse_salary_range(sal_text)
            if s_min is not None or s_max is not None:
                cursor.execute(
                    "UPDATE jobs SET salary_min = ?, salary_max = ? WHERE reference_number = ?",
                    (s_min, s_max, ref)
                )
                updated += 1
        conn.commit()
        return updated


def job_exists(reference_number: str) -> bool:
    """Check if a job reference number already exists in the database."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM jobs WHERE reference_number = ? LIMIT 1", (reference_number,))
        return cursor.fetchone() is not None


def get_existing_references() -> Set[str]:
    """Retrieve all existing job reference numbers for fast in-memory lookups."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT reference_number FROM jobs")
        return {row[0] for row in cursor.fetchall()}


def upsert_job(job_data: Dict) -> bool:
    """
    Insert or update a job record including enhanced filter fields.
    Returns True if a new job was inserted, False if it was updated.
    """
    now_iso = datetime.now().isoformat()
    ref = str(job_data.get("reference_number", "")).strip()
    if not ref:
        return False

    # Compute salary min/max if not explicitly passed
    s_min = job_data.get("salary_min")
    s_max = job_data.get("salary_max")
    if s_min is None and s_max is None and job_data.get("salary"):
        s_min, s_max = parse_salary_range(job_data.get("salary"))

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT first_seen_at FROM jobs WHERE reference_number = ?", (ref,))
        existing = cursor.fetchone()

        if existing:
            # Update existing job
            cursor.execute("""
                UPDATE jobs SET
                    title = ?,
                    department = ?,
                    location = ?,
                    salary = ?,
                    salary_min = COALESCE(?, salary_min),
                    salary_max = COALESCE(?, salary_max),
                    job_grade = COALESCE(?, job_grade),
                    role_type = COALESCE(?, role_type),
                    working_pattern = COALESCE(?, working_pattern),
                    contract_type = COALESCE(?, contract_type),
                    closing_date = ?,
                    job_url = ?,
                    logo_url = ?,
                    last_scraped_at = ?
                WHERE reference_number = ?
            """, (
                job_data.get("title", ""),
                job_data.get("department", ""),
                job_data.get("location", ""),
                job_data.get("salary", ""),
                s_min,
                s_max,
                job_data.get("job_grade"),
                job_data.get("role_type"),
                job_data.get("working_pattern"),
                job_data.get("contract_type"),
                job_data.get("closing_date", ""),
                job_data.get("job_url", ""),
                job_data.get("logo_url", ""),
                now_iso,
                ref
            ))
            conn.commit()
            return False
        else:
            # Insert new job
            cursor.execute("""
                INSERT INTO jobs (
                    reference_number, title, department, location,
                    salary, salary_min, salary_max,
                    job_grade, role_type, working_pattern, contract_type,
                    closing_date, job_url, logo_url,
                    first_seen_at, last_scraped_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                ref,
                job_data.get("title", ""),
                job_data.get("department", ""),
                job_data.get("location", ""),
                job_data.get("salary", ""),
                s_min,
                s_max,
                job_data.get("job_grade"),
                job_data.get("role_type"),
                job_data.get("working_pattern"),
                job_data.get("contract_type"),
                job_data.get("closing_date", ""),
                job_data.get("job_url", ""),
                job_data.get("logo_url", ""),
                now_iso,
                now_iso
            ))
            conn.commit()
            return True


def update_job_metadata(ref: str, metadata: Dict) -> bool:
    """Update detailed metadata fields for an existing job."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE jobs SET
                job_grade = COALESCE(?, job_grade),
                role_type = COALESCE(?, role_type),
                working_pattern = COALESCE(?, working_pattern),
                contract_type = COALESCE(?, contract_type)
            WHERE reference_number = ?
        """, (
            metadata.get("job_grade"),
            metadata.get("role_type"),
            metadata.get("working_pattern"),
            metadata.get("contract_type"),
            ref
        ))
        conn.commit()
        return cursor.rowcount > 0


def get_jobs(
    search: str = "",
    department: str = "",
    location: str = "",
    min_salary: Optional[int] = None,
    max_salary: Optional[int] = None,
    job_grade: str = "",
    role_type: str = "",
    working_pattern: str = "",
    contract_type: str = "",
    only_new_today: bool = False,
    limit: int = 50,
    offset: int = 0,
    sort_by: str = "first_seen_at",
    sort_order: str = "desc"
) -> List[Dict]:
    """Retrieve jobs with full multi-facet filtering, salary range, sorting, and pagination."""
    query = "SELECT * FROM jobs WHERE 1=1"
    params: List = []

    if search:
        query += " AND (title LIKE ? OR department LIKE ? OR location LIKE ? OR reference_number LIKE ?)"
        s_pattern = f"%{search}%"
        params.extend([s_pattern, s_pattern, s_pattern, s_pattern])

    if department:
        query += " AND department = ?"
        params.append(department)

    if location:
        query += " AND location LIKE ?"
        params.append(f"%{location}%")

    if min_salary is not None and min_salary > 0:
        # Matches jobs where maximum salary >= user minimum (or min salary >= user minimum)
        query += " AND (salary_max >= ? OR (salary_max IS NULL AND salary_min >= ?))"
        params.extend([min_salary, min_salary])

    if max_salary is not None and max_salary > 0:
        # Matches jobs where minimum salary <= user maximum (or max salary <= user maximum)
        query += " AND (salary_min <= ? OR (salary_min IS NULL AND salary_max <= ?))"
        params.extend([max_salary, max_salary])

    if job_grade:
        query += " AND job_grade LIKE ?"
        params.append(f"%{job_grade}%")

    if role_type:
        query += " AND role_type LIKE ?"
        params.append(f"%{role_type}%")

    if working_pattern:
        query += " AND working_pattern LIKE ?"
        params.append(f"%{working_pattern}%")

    if contract_type:
        query += " AND contract_type LIKE ?"
        params.append(f"%{contract_type}%")

    if only_new_today:
        today_prefix = date.today().isoformat() + "%"
        query += " AND first_seen_at LIKE ?"
        params.append(today_prefix)

    # Sort validation
    allowed_sorts = {
        "first_seen_at": "first_seen_at",
        "closing_date": "closing_date",
        "title": "title",
        "department": "department",
        "salary_min": "salary_min",
        "salary_max": "salary_max",
    }
    safe_sort = allowed_sorts.get(sort_by, "first_seen_at")
    safe_order = "ASC" if sort_order.lower() == "asc" else "DESC"

    query += f" ORDER BY {safe_sort} {safe_order} LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query, params)
        rows = cursor.fetchall()
        return [dict(row) for row in rows]


def count_jobs(
    search: str = "",
    department: str = "",
    location: str = "",
    min_salary: Optional[int] = None,
    max_salary: Optional[int] = None,
    job_grade: str = "",
    role_type: str = "",
    working_pattern: str = "",
    contract_type: str = "",
    only_new_today: bool = False
) -> int:
    """Count total jobs matching all current filter conditions."""
    query = "SELECT COUNT(*) FROM jobs WHERE 1=1"
    params: List = []

    if search:
        query += " AND (title LIKE ? OR department LIKE ? OR location LIKE ? OR reference_number LIKE ?)"
        s_pattern = f"%{search}%"
        params.extend([s_pattern, s_pattern, s_pattern, s_pattern])

    if department:
        query += " AND department = ?"
        params.append(department)

    if location:
        query += " AND location LIKE ?"
        params.append(f"%{location}%")

    if min_salary is not None and min_salary > 0:
        query += " AND (salary_max >= ? OR (salary_max IS NULL AND salary_min >= ?))"
        params.extend([min_salary, min_salary])

    if max_salary is not None and max_salary > 0:
        query += " AND (salary_min <= ? OR (salary_min IS NULL AND salary_max <= ?))"
        params.extend([max_salary, max_salary])

    if job_grade:
        query += " AND job_grade LIKE ?"
        params.append(f"%{job_grade}%")

    if role_type:
        query += " AND role_type LIKE ?"
        params.append(f"%{role_type}%")

    if working_pattern:
        query += " AND working_pattern LIKE ?"
        params.append(f"%{working_pattern}%")

    if contract_type:
        query += " AND contract_type LIKE ?"
        params.append(f"%{contract_type}%")

    if only_new_today:
        today_prefix = date.today().isoformat() + "%"
        query += " AND first_seen_at LIKE ?"
        params.append(today_prefix)

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query, params)
        return cursor.fetchone()[0]


def get_departments() -> List[str]:
    """Get unique list of departments."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT department FROM jobs WHERE department IS NOT NULL AND department != '' ORDER BY department ASC")
        return [row[0] for row in cursor.fetchall()]


def get_job_grades() -> List[str]:
    """Get unique list of job grades."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT job_grade FROM jobs WHERE job_grade IS NOT NULL AND job_grade != '' ORDER BY job_grade ASC")
        return [row[0] for row in cursor.fetchall()]


def get_role_types() -> List[str]:
    """Get unique list of role types."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT role_type FROM jobs WHERE role_type IS NOT NULL AND role_type != '' ORDER BY role_type ASC")
        # Role types can be comma separated
        unique_roles = set()
        for row in cursor.fetchall():
            for role in row[0].split(","):
                clean = role.strip()
                if clean:
                    unique_roles.add(clean)
        return sorted(list(unique_roles))


def get_contract_types() -> List[str]:
    """Get unique list of contract types."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT contract_type FROM jobs WHERE contract_type IS NOT NULL AND contract_type != '' ORDER BY contract_type ASC")
        unique_contracts = set()
        for row in cursor.fetchall():
            for c in row[0].split(","):
                clean = c.strip()
                if clean:
                    unique_contracts.add(clean)
        return sorted(list(unique_contracts))


def get_working_patterns() -> List[str]:
    """Get unique list of working patterns."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT working_pattern FROM jobs WHERE working_pattern IS NOT NULL AND working_pattern != '' ORDER BY working_pattern ASC")
        unique_patterns = set()
        for row in cursor.fetchall():
            for p in row[0].split(","):
                clean = p.strip()
                if clean:
                    unique_patterns.add(clean)
        return sorted(list(unique_patterns))


def get_filter_options() -> Dict:
    """Retrieve all available facet filter options in a single call."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT MIN(salary_min), MAX(salary_max) FROM jobs WHERE salary_min > 0")
        min_s, max_s = cursor.fetchone()
        
    return {
        "departments": get_departments(),
        "job_grades": get_job_grades(),
        "role_types": get_role_types(),
        "contract_types": get_contract_types(),
        "working_patterns": get_working_patterns(),
        "salary_range": {
            "min": min_s or 15000,
            "max": max_s or 150000
        }
    }


def get_jobs_missing_details(limit: int = 50) -> List[Dict]:
    """Return jobs that have not yet had their detail page metadata scraped."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT reference_number, job_url, title
            FROM jobs
            WHERE job_grade IS NULL OR role_type IS NULL OR contract_type IS NULL
            LIMIT ?
        """, (limit,))
        return [dict(row) for row in cursor.fetchall()]


def count_jobs_missing_details() -> int:
    """Count jobs that do not yet have detail metadata."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT COUNT(*) FROM jobs
            WHERE job_grade IS NULL OR role_type IS NULL OR contract_type IS NULL
        """)
        return cursor.fetchone()[0]


def get_dashboard_stats() -> Dict:
    """Calculate aggregate statistics for dashboard metrics."""
    today_prefix = date.today().isoformat() + "%"
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) FROM jobs")
        total_jobs = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM jobs WHERE first_seen_at LIKE ?", (today_prefix,))
        new_jobs_today = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(DISTINCT department) FROM jobs WHERE department IS NOT NULL AND department != ''")
        departments_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT * FROM scrape_logs ORDER BY id DESC LIMIT 1")
        last_log = cursor.fetchone()
        last_run = dict(last_log) if last_log else None
        
        return {
            "total_jobs": total_jobs,
            "new_jobs_today": new_jobs_today,
            "departments_count": departments_count,
            "last_run": last_run
        }


def log_scrape_run(
    mode: str,
    pages_scraped: int,
    jobs_found: int,
    new_jobs_added: int,
    duration_seconds: float,
    status: str = "success",
    error_message: Optional[str] = None
) -> int:
    """Record scrape run outcome."""
    now_iso = datetime.now().isoformat()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO scrape_logs (
                run_at, mode, pages_scraped, jobs_found,
                new_jobs_added, duration_seconds, status, error_message
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            now_iso, mode, pages_scraped, jobs_found,
            new_jobs_added, duration_seconds, status, error_message
        ))
        conn.commit()
        return cursor.lastrowid


def get_recent_logs(limit: int = 10) -> List[Dict]:
    """Retrieve recent scrape logs."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM scrape_logs ORDER BY id DESC LIMIT ?", (limit,))
        return [dict(row) for row in cursor.fetchall()]


# ==========================================
# User Authentication & Profile Management
# ==========================================

# ==========================================
# User Authentication & Profile Management (Decoupled User Store)
# ==========================================

def validate_password_complexity(password: str) -> Tuple[bool, Optional[str]]:
    """
    Enforce security criteria:
    - At least 8 characters
    - At least 1 uppercase letter (A-Z)
    - At least 1 lowercase letter (a-z)
    - At least 1 number (0-9)
    - At least 1 special character (!@#$%^&*...)
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters long."
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter (A-Z)."
    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter (a-z)."
    if not re.search(r"\d", password):
        return False, "Password must contain at least one number (0-9)."
    if not re.search(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>\/?~`]", password):
        return False, "Password must contain at least one special character (e.g. !@#$%^&*)."
    return True, None


def hash_password(password: str, salt: Optional[str] = None) -> Tuple[str, str]:
    """Hash password using PBKDF2-HMAC-SHA256 with 100,000 iterations and salt."""
    if not salt:
        salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000)
    return key.hex(), salt


def verify_password(password: str, password_hash: str, salt: str) -> bool:
    """Verify password matches stored hash given salt."""
    computed_hash, _ = hash_password(password, salt)
    return secrets.compare_digest(computed_hash, password_hash)


def create_user(
    username: str,
    email: str,
    password: str,
    resume_file: Optional[Dict] = None
) -> Dict:
    """Register a new user in the isolated user store with strict password complexity."""
    username = username.strip()
    email = email.strip().lower()

    if len(username) < 3:
        raise ValueError("Username must be at least 3 characters long.")
    if "@" not in email or "." not in email:
        raise ValueError("Please provide a valid email address.")

    valid, err_msg = validate_password_complexity(password)
    if not valid:
        raise ValueError(err_msg)

    pwd_hash, salt = hash_password(password)
    now_iso = datetime.now().isoformat()
    default_prefs = {
        "locations": [],
        "min_salary": None,
        "max_salary": None,
        "job_grade": "",
        "role_type": "",
        "working_pattern": "",
        "contract_type": ""
    }

    with get_users_db_connection() as conn:
        cursor = conn.cursor()

        # Check uniqueness
        cursor.execute("SELECT id FROM users WHERE username = ? OR email = ?", (username, email))
        if cursor.fetchone():
            raise ValueError("Username or email is already registered.")

        cursor.execute("""
            INSERT INTO users (username, email, password_hash, salt, created_at, preferences_json)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (username, email, pwd_hash, salt, now_iso, json.dumps(default_prefs)))
        user_id = cursor.lastrowid

        # If an initial resume was uploaded during registration
        if resume_file and resume_file.get("content"):
            cursor.execute("""
                INSERT INTO user_resumes (
                    user_id, filename, description, file_content, file_size, content_type, is_primary, uploaded_at
                ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)
            """, (
                user_id,
                resume_file.get("filename", "resume.pdf"),
                resume_file.get("description", "Primary Resume"),
                resume_file.get("content"),
                len(resume_file.get("content")),
                resume_file.get("content_type", "application/pdf"),
                now_iso
            ))

        conn.commit()

        return {
            "id": user_id,
            "username": username,
            "email": email,
            "created_at": now_iso,
            "preferences": default_prefs
        }


def authenticate_user(username_or_email: str, password: str) -> Optional[Dict]:
    """Authenticate user with username/email and password against isolated user store."""
    term = username_or_email.strip()
    with get_users_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, username, email, password_hash, salt, created_at, preferences_json
            FROM users
            WHERE LOWER(username) = ? OR LOWER(email) = ?
        """, (term.lower(), term.lower()))
        row = cursor.fetchone()
        if not row:
            return None

        if verify_password(password, row["password_hash"], row["salt"]):
            prefs = json.loads(row["preferences_json"]) if row["preferences_json"] else {}
            return {
                "id": row["id"],
                "username": row["username"],
                "email": row["email"],
                "created_at": row["created_at"],
                "preferences": prefs
            }
        return None


def create_session(user_id: int, days_valid: int = 30) -> str:
    """Create a persistent user session token in isolated user store."""
    token = secrets.token_hex(32)
    now = datetime.now()
    expires = now + timedelta(days=days_valid)

    with get_users_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO user_sessions (token, user_id, created_at, expires_at)
            VALUES (?, ?, ?, ?)
        """, (token, user_id, now.isoformat(), expires.isoformat()))
        conn.commit()

    return token


def get_user_by_session(token: str) -> Optional[Dict]:
    """Retrieve user details for an active session token."""
    if not token:
        return None
    now_iso = datetime.now().isoformat()
    with get_users_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT u.id, u.username, u.email, u.created_at, u.preferences_json
            FROM user_sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.token = ? AND s.expires_at > ?
        """, (token, now_iso))
        row = cursor.fetchone()
        if not row:
            return None

        cursor.execute("SELECT COUNT(*) as count FROM user_resumes WHERE user_id = ?", (row["id"],))
        res_count = cursor.fetchone()["count"]

        prefs = json.loads(row["preferences_json"]) if row["preferences_json"] else {}
        return {
            "id": row["id"],
            "username": row["username"],
            "email": row["email"],
            "created_at": row["created_at"],
            "preferences": prefs,
            "resume_count": res_count
        }


def delete_session(token: str) -> bool:
    """Invalidate a user session on logout."""
    with get_users_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM user_sessions WHERE token = ?", (token,))
        conn.commit()
        return cursor.rowcount > 0


def update_user_preferences(user_id: int, preferences: Dict) -> Dict:
    """Update search and career preferences for a user."""
    prefs_json = json.dumps(preferences)
    with get_users_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET preferences_json = ? WHERE id = ?", (prefs_json, user_id))
        conn.commit()
    return preferences


def add_user_resume(
    user_id: int,
    filename: str,
    description: str,
    file_content: bytes,
    content_type: str,
    is_primary: bool = False
) -> Dict:
    """Upload and store a new resume with a specific description."""
    now_iso = datetime.now().isoformat()
    with get_users_db_connection() as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) as cnt FROM user_resumes WHERE user_id = ?", (user_id,))
        count = cursor.fetchone()["cnt"]
        if count == 0:
            is_primary = True

        if is_primary:
            cursor.execute("UPDATE user_resumes SET is_primary = 0 WHERE user_id = ?", (user_id,))

        cursor.execute("""
            INSERT INTO user_resumes (
                user_id, filename, description, file_content, file_size, content_type, is_primary, uploaded_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            user_id,
            filename,
            description or "My Resume",
            file_content,
            len(file_content),
            content_type,
            1 if is_primary else 0,
            now_iso
        ))
        resume_id = cursor.lastrowid
        conn.commit()

        return {
            "id": resume_id,
            "user_id": user_id,
            "filename": filename,
            "description": description or "My Resume",
            "file_size": len(file_content),
            "content_type": content_type,
            "is_primary": bool(is_primary),
            "uploaded_at": now_iso
        }


def get_user_resumes(user_id: int) -> List[Dict]:
    """Retrieve metadata of all resumes uploaded by a user (excludes large binary content)."""
    with get_users_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, user_id, filename, description, file_size, content_type, is_primary, uploaded_at
            FROM user_resumes
            WHERE user_id = ?
            ORDER BY is_primary DESC, id DESC
        """, (user_id,))
        rows = cursor.fetchall()
        return [
            {
                "id": r["id"],
                "user_id": r["user_id"],
                "filename": r["filename"],
                "description": r["description"],
                "file_size": r["file_size"],
                "content_type": r["content_type"],
                "is_primary": bool(r["is_primary"]),
                "uploaded_at": r["uploaded_at"]
            }
            for r in rows
        ]


def get_resume_by_id(resume_id: int, user_id: int) -> Optional[Dict]:
    """Fetch full resume record including binary content for downloading."""
    with get_users_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, user_id, filename, description, file_content, file_size, content_type, is_primary, uploaded_at
            FROM user_resumes
            WHERE id = ? AND user_id = ?
        """, (resume_id, user_id))
        row = cursor.fetchone()
        if not row:
            return None
        return dict(row)


def delete_user_resume(resume_id: int, user_id: int) -> bool:
    """Delete a resume for a user."""
    with get_users_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT is_primary FROM user_resumes WHERE id = ? AND user_id = ?", (resume_id, user_id))
        row = cursor.fetchone()
        if not row:
            return False

        was_primary = bool(row["is_primary"])
        cursor.execute("DELETE FROM user_resumes WHERE id = ? AND user_id = ?", (resume_id, user_id))

        if was_primary:
            cursor.execute("""
                UPDATE user_resumes
                SET is_primary = 1
                WHERE id = (SELECT id FROM user_resumes WHERE user_id = ? ORDER BY id DESC LIMIT 1)
            """, (user_id,))

        conn.commit()
        return True


def set_primary_resume(resume_id: int, user_id: int) -> bool:
    """Set a specific resume as the primary/active one."""
    with get_users_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM user_resumes WHERE id = ? AND user_id = ?", (resume_id, user_id))
        if not cursor.fetchone():
            return False
        cursor.execute("UPDATE user_resumes SET is_primary = 0 WHERE user_id = ?", (user_id,))
        cursor.execute("UPDATE user_resumes SET is_primary = 1 WHERE id = ? AND user_id = ?", (resume_id, user_id))
        conn.commit()
        return True


def save_user_job_bookmark(user_id: int, job_reference: str, notes: str = "") -> bool:
    """Save/bookmark a job for a user in the isolated user store."""
    now_iso = datetime.now().isoformat()
    with get_users_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO user_saved_jobs (user_id, job_reference, saved_at, notes)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, job_reference) DO UPDATE SET saved_at = ?, notes = ?
        """, (user_id, job_reference, now_iso, notes, now_iso, notes))
        conn.commit()
        return True


def remove_user_job_bookmark(user_id: int, job_reference: str) -> bool:
    """Remove a bookmarked job."""
    with get_users_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM user_saved_jobs WHERE user_id = ? AND job_reference = ?", (user_id, job_reference))
        conn.commit()
        return cursor.rowcount > 0


def get_user_saved_job_references(user_id: int) -> List[str]:
    """Get list of job references bookmarked by user."""
    with get_users_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT job_reference FROM user_saved_jobs WHERE user_id = ? ORDER BY saved_at DESC", (user_id,))
        return [r["job_reference"] for r in cursor.fetchall()]


# Run initialization on import
try:
    init_db()
except Exception as e:
    logger.warning(f"Database initialization deferred or skipped: {e}")

