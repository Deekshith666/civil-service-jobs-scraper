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
from typing import Any, Dict, List, Optional, Set, Tuple, Union
from config import (
    JOBS_DB_PATH,
    USERS_DB_PATH,
    SYNCED_JOBS_DB_PATH,
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


MONTH_MAP = {
    'january': '01', 'jan': '01',
    'february': '02', 'feb': '02',
    'march': '03', 'mar': '03',
    'april': '04', 'apr': '04',
    'may': '05',
    'june': '06', 'jun': '06',
    'july': '07', 'jul': '07',
    'august': '08', 'aug': '08',
    'september': '09', 'sep': '09', 'sept': '09',
    'october': '10', 'oct': '10',
    'november': '11', 'nov': '11',
    'december': '12', 'dec': '12'
}


def parse_closing_date_to_iso(date_str: Optional[str]) -> Optional[str]:
    """
    Parse a closing date string into ISO format YYYY-MM-DD.
    Handles:
      - '2026-10-05'
      - '11:55 pm on Monday 5th October 2026'
      - 'Sunday 18th October 2026'
      - '18 October 2026'
      - '05/10/2026'
    """
    if not date_str:
        return None
    s = str(date_str).strip()
    if not s:
        return None

    # Check for direct ISO YYYY-MM-DD
    iso_match = re.search(r'\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b', s)
    if iso_match:
        return f"{iso_match.group(1)}-{iso_match.group(2)}-{iso_match.group(3)}"

    # Match '5th October 2026' or '18 October 2026' or '5 Oct 2026'
    text_match = re.search(r'\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(20\d{2})\b', s)
    if text_match:
        day = int(text_match.group(1))
        month_name = text_match.group(2).lower()
        year = text_match.group(3)
        month_num = MONTH_MAP.get(month_name)
        if month_num and 1 <= day <= 31:
            return f"{year}-{month_num}-{day:02d}"

    # Match DD/MM/YYYY or DD-MM-YYYY
    dmy_match = re.search(r'\b(0?[1-9]|[12]\d|3[01])[/-](0?[1-9]|1[0-2])[/-](20\d{2})\b', s)
    if dmy_match:
        day = int(dmy_match.group(1))
        month = int(dmy_match.group(2))
        year = dmy_match.group(3)
        return f"{year}-{month:02d}-{day:02d}"

    return None



CANONICAL_JOB_COLUMNS = [
    "reference_number",
    "title",
    "department",
    "location",
    "salary",
    "closing_date",
    "job_url",
    "logo_url",
    "first_seen_at",
    "last_scraped_at",
    "salary_min",
    "salary_max",
    "job_grade",
    "role_type",
    "working_pattern",
    "contract_type",
    "number_of_jobs",
    "closing_date_iso",
]
CANONICAL_JOB_COLUMNS_SQL = ", ".join(CANONICAL_JOB_COLUMNS)


def get_jobs_db_connection() -> sqlite3.Connection:
    """
    Create and return a database connection to the scraped jobs catalog.
    Uses immutable URI mode on read-only environments (e.g. Vercel serverless).
    Dynamically attaches synced_jobs.db and creates a unified_jobs temporary view if synced jobs exist.
    """
    db_file_str = str(JOBS_DB_PATH)

    if not is_jobs_db_writable():
        uri_path = Path(db_file_str).resolve().as_posix()
        conn = sqlite3.connect(f"file:{uri_path}?mode=ro&immutable=1", uri=True)
    else:
        try:
            conn = sqlite3.connect(db_file_str)
        except sqlite3.OperationalError as e:
            if "readonly" in str(e).lower() or "attempt to write" in str(e).lower() or "unable to open" in str(e).lower():
                uri_path = Path(db_file_str).resolve().as_posix()
                conn = sqlite3.connect(f"file:{uri_path}?mode=ro&immutable=1", uri=True)
            else:
                raise

    conn.row_factory = sqlite3.Row

    # Dynamically attach synced_jobs.db overlay if present and populated
    if SYNCED_JOBS_DB_PATH.exists() and SYNCED_JOBS_DB_PATH.stat().st_size > 0:
        try:
            synced_posix = Path(SYNCED_JOBS_DB_PATH).resolve().as_posix()
            conn.execute(f"ATTACH DATABASE '{synced_posix}' AS synced")
            conn.execute(f"""
                CREATE TEMP VIEW IF NOT EXISTS unified_jobs AS
                SELECT {CANONICAL_JOB_COLUMNS_SQL} FROM jobs
                WHERE reference_number NOT IN (SELECT reference_number FROM synced.jobs)
                UNION ALL
                SELECT {CANONICAL_JOB_COLUMNS_SQL} FROM synced.jobs
            """)
        except Exception as e:
            logger.warning(f"Could not attach synced_jobs.db: {e}")

    return conn


def get_jobs_table_target(conn: sqlite3.Connection) -> str:
    """Return 'unified_jobs' if synced overlay view is active, otherwise 'jobs'."""
    try:
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM sqlite_temp_master WHERE type='view' AND name='unified_jobs'")
        if cur.fetchone():
            return "unified_jobs"
    except Exception:
        pass
    return "jobs"


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
                ("number_of_jobs", "INTEGER DEFAULT 1"),
                ("closing_date_iso", "TEXT"),
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
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_jobs_closing_iso ON jobs(closing_date_iso)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_jobs_salary_min ON jobs(salary_min)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_jobs_salary_max ON jobs(salary_max)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_jobs_grade ON jobs(job_grade)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_jobs_role ON jobs(role_type)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_jobs_contract ON jobs(contract_type)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_jobs_pattern ON jobs(working_pattern)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_jobs_number_of_jobs ON jobs(number_of_jobs)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_logs_run_at ON scrape_logs(run_at)")
            conn.commit()
    except sqlite3.OperationalError as e:
        logger.warning(f"Jobs DB initialization skipped: {e}")


SHILPA_CV_TEXT = """# SHILPA SIVADAS
London, UK | +44 7700 900789 | shilpasivadas197@gmail.com | linkedin.com/in/shilpa-sivadas

## PROFESSIONAL SUMMARY
Results-driven Civil Service Operational Specialist and Project Manager with over 7 years of expertise in public sector delivery, workshop supervision, health & safety compliance, and stakeholder engagement. Proven capability in delivering at pace, managing cross-functional teams, and implementing evidence-based operational improvements aligned with Civil Service Success Profiles.

## CORE COMPETENCIES
- Operational Workflow Management & Public Service Delivery
- Civil Service Success Profiles & Governance Compliance
- Health & Safety Compliance, COSHH Risk Assessments & Audits
- Woodworking Machinery, Equipment Maintenance & Workshop Supervision
- Team Leadership, Mentoring & Capability Building
- Quality Assurance, Standards Verification & Process Optimization
- Stakeholder Engagement & Strategic Cross-Departmental Communication
- Resource Allocation, Budget Tracking & Continuous Improvement

## PROFESSIONAL EXPERIENCE

### Senior Operations Lead | HM Prison & Probation Service (HMPPS)
*London & South East* | *2021 - Present*
- Supervised daily operational workflows and technical workshop activities across 3 regional facilities, achieving a 98% service compliance rate.
- Enforced strict Health & Safety standards, conducting comprehensive risk assessments and machinery audits resulting in zero reportable HSE incidents over 36 months.
- Operated and supervised workshop machinery including precision wood processing, tooling, and fabrication equipment.
- Led and mentored a multidisciplinary team of 16 caseworkers and apprentice technicians, fostering capability building and professional development.
- Streamlined administrative and case-triage pipelines, reducing backlog by 26% while upholding statutory confidentiality and data governance.

### Project & Operational Delivery Officer | Ministry of Justice (MoJ)
*London, UK* | *2018 - 2021*
- Managed cross-departmental delivery milestones for a £2.2M facilities modernization initiative across 5 regional sites.
- Monitored project risk registers, tracking key performance indicators and reporting bi-weekly delivery progress to executive governance boards.
- Facilitated working groups with senior civil service stakeholders and trade unions to align operational changes with national policy standards.
- Implemented continuous improvement methodologies that reduced process turnaround by 21%.

## EDUCATION & QUALIFICATIONS
- **BSc (Hons) Public Management & Administration (First Class)** | University of London | *2018*
- **Prince2 Practitioner Certified** | AXELOS | *2020*
- **IOSH Managing Safely Certified** | Institution of Occupational Safety and Health | *2021*
- **Level 3 NVQ / City & Guilds in Machine Woodworking & Technical Supervision** | *2019*
- **Active Enhanced Security Clearance (SC)**
"""

DEMO_CV_TEXT = """# DEEKSHITH KUMAR
London, SW1A 2AA | +44 7700 900456 | deekshith.kumar@email.co.uk | linkedin.com/in/deekshith-civil

## PROFESSIONAL SUMMARY
Dedicated and experienced Public Sector Technical & Operational Specialist with over 7 years of background in workshop management, woodworking machinery operation, and facility supervision. Strong track record of adhering to HSE compliance standards, mentoring apprentices, and delivering at pace within strict departmental schedules.

## CORE COMPETENCIES
- Woodworking Machinery Operation & Precision Tooling
- Health & Safety Compliance & COSHH Risk Assessments
- Workshop Supervision, Equipment Maintenance & Tooling
- Civil Service Success Profiles & Operational Delivery
- Quality Assurance, Material Inspections & Precision Standards
- Inventory & Stock Management, Waste Reduction
- Apprenticeship Training, Mentoring & Capability Building

## PROFESSIONAL EXPERIENCE

### Workshop Supervisor & Senior Machinist | Ministry of Justice (HMPPS)
*HMP Isle of Wight & Winchester* | *2021 - Present*
- Supervised daily woodworking machine operations, ensuring 100% adherence to Safe Operating Procedures and workshop safety protocols.
- Operated advanced woodworking machinery including circular saws, spindle moulders, surface planers, and edge-banders.
- Trained and supervised 12 apprentice technicians in machine safety and joinery techniques, resulting in a 98% qualification pass rate.
- Conducted regular maintenance, tooling replacements, and weekly safety audits, maintaining zero reportable incidents over 36 consecutive months.
- Managed timber inventory and consumable stock, reducing material waste by 18% through optimized cutting schedules.

### Operations & Production Specialist | HM Facilities & Estates Service
*Southampton, UK* | *2018 - 2021*
- Coordinated workshop equipment fabrication and timber fittings across public sector estate refurbishment contracts.
- Collaborated with cross-functional health and safety inspectors to draft updated risk assessments and emergency protocol guidelines.
- Delivered weekly operational progress reports to executive project managers, consistently achieving milestones two weeks ahead of schedule.

## EDUCATION & QUALIFICATIONS
- **Level 3 NVQ Diploma in Machine Woodworking & Joinery** | City & Guilds | *2018*
- **IOSH Managing Safely Certified** | Institution of Occupational Safety and Health | *2022*
- **First Aid at Work & Fire Warden Certified** | *2023*
- **BPSS & Enhanced Security Clearance Active**
"""


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

            # Tailored Personal Statements per job advert and CV
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS personal_statements (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER DEFAULT 0,
                    job_reference TEXT NOT NULL,
                    resume_id INTEGER DEFAULT 0,
                    cv_hash TEXT DEFAULT '',
                    cv_name TEXT DEFAULT '',
                    statement_text TEXT NOT NULL,
                    word_count INTEGER DEFAULT 0,
                    target_words INTEGER DEFAULT 750,
                    additional_notes TEXT DEFAULT '',
                    model_used TEXT DEFAULT 'openai',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)

            cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON user_resumes(user_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(token)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_saved_jobs_user ON user_saved_jobs(user_id)")
            cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_ps_job_resume ON personal_statements(job_reference, resume_id, user_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_ps_cv_hash ON personal_statements(job_reference, cv_hash, user_id)")

            # Auto-seed / Self-heal default users and resumes
            # 1. demo_applicant
            cursor.execute("SELECT id FROM users WHERE username = 'demo_applicant'")
            demo_user = cursor.fetchone()
            if not demo_user:
                cursor.execute("""
                    INSERT INTO users (username, email, password_hash, salt, created_at, preferences_json)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    "demo_applicant",
                    "demo.candidate@gov.uk",
                    "0c93bcc39f52d6423c81562fc83a109abfa1c6b32fe59f1de8d96be6611a57ec",
                    "7f5351dcde6d653ca2ae514c79478dcb",
                    datetime.now().isoformat(),
                    json.dumps({
                        "locations": ["London", "National"],
                        "min_salary": 35000,
                        "max_salary": None,
                        "job_grade": "Senior Executive Officer (SEO)",
                        "role_type": "Operational Delivery",
                        "working_pattern": "Full-time",
                        "contract_type": "Permanent"
                    })
                ))
                demo_user_id = cursor.lastrowid
            else:
                demo_user_id = demo_user["id"]

            cursor.execute("SELECT COUNT(*) as cnt FROM user_resumes WHERE user_id = ?", (demo_user_id,))
            if cursor.fetchone()["cnt"] == 0:
                demo_cv_bytes = DEMO_CV_TEXT.encode("utf-8")
                cursor.execute("""
                    INSERT INTO user_resumes (
                        user_id, filename, description, file_content, file_size, content_type, is_primary, uploaded_at
                    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)
                """, (
                    demo_user_id,
                    "Deekshith_Kumar_Civil_Service_CV.txt",
                    "Primary Civil Service Technical & Operations CV",
                    demo_cv_bytes,
                    len(demo_cv_bytes),
                    "text/plain",
                    datetime.now().isoformat()
                ))

            # 2. Shilpasivadas197
            cursor.execute("SELECT id FROM users WHERE username = 'Shilpasivadas197'")
            shilpa_user = cursor.fetchone()
            if not shilpa_user:
                cursor.execute("""
                    INSERT INTO users (username, email, password_hash, salt, created_at, preferences_json)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    "Shilpasivadas197",
                    "shilpasivadas197@gmail.com",
                    "e01edd9d5544e53def5e288cc2a820b10d0cb692c2304b2692e2101ee9ba9e4b",
                    "a187a39f285daaeeb92603e2c4a3f511",
                    datetime.now().isoformat(),
                    json.dumps({
                        "locations": ["London"],
                        "min_salary": None,
                        "max_salary": None,
                        "job_grade": "",
                        "role_type": "",
                        "working_pattern": "",
                        "contract_type": ""
                    })
                ))
                shilpa_user_id = cursor.lastrowid
            else:
                shilpa_user_id = shilpa_user["id"]

            cursor.execute("SELECT COUNT(*) as cnt FROM user_resumes WHERE user_id = ?", (shilpa_user_id,))
            if cursor.fetchone()["cnt"] == 0:
                shilpa_cv_bytes = SHILPA_CV_TEXT.encode("utf-8")
                cursor.execute("""
                    INSERT INTO user_resumes (
                        user_id, filename, description, file_content, file_size, content_type, is_primary, uploaded_at
                    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)
                """, (
                    shilpa_user_id,
                    "Shilpa_Sivadas_Civil_Service_CV.txt",
                    "Primary Civil Service Operations & Technical CV",
                    shilpa_cv_bytes,
                    len(shilpa_cv_bytes),
                    "text/plain",
                    datetime.now().isoformat()
                ))

            conn.commit()
    except Exception as e:
        logger.error(f"Error initializing users database: {e}")


def init_db():
    """Initialize both jobs catalog and user store schemas, then backfill and purge expired records."""
    init_jobs_db()
    init_users_db()
    backfill_closing_dates()
    cleanup_expired_jobs()


def backfill_closing_dates() -> int:
    """Populate closing_date_iso for jobs where it is missing."""
    if not is_jobs_db_writable():
        return 0
    updated = 0
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("PRAGMA table_info(jobs)")
            cols = {row[1] for row in cursor.fetchall()}
            if "closing_date_iso" not in cols:
                return 0
            cursor.execute("SELECT reference_number, closing_date FROM jobs WHERE closing_date IS NOT NULL AND (closing_date_iso IS NULL OR closing_date_iso = '')")
            rows = cursor.fetchall()
            for ref, c_date in rows:
                c_iso = parse_closing_date_to_iso(c_date)
                if c_iso:
                    cursor.execute("UPDATE jobs SET closing_date_iso = ? WHERE reference_number = ?", (c_iso, ref))
                    updated += 1
            conn.commit()
    except Exception as e:
        logger.warning(f"Failed to backfill closing_date_iso: {e}")
    return updated


def cleanup_expired_jobs() -> int:
    """
    Permanently remove expired jobs (where closing date is before today) from writable databases.
    Returns total count of removed records.
    """
    today_iso = date.today().isoformat()
    total_cleaned = 0

    if is_jobs_db_writable():
        try:
            with get_jobs_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("PRAGMA table_info(jobs)")
                cols = {row[1] for row in cursor.fetchall()}
                if "closing_date_iso" in cols:
                    cursor.execute("DELETE FROM jobs WHERE closing_date_iso IS NOT NULL AND closing_date_iso < ?", (today_iso,))
                    del_count = cursor.rowcount
                    conn.commit()
                    if del_count > 0:
                        logger.info(f"Cleaned up {del_count} expired jobs from primary jobs.db")
                    total_cleaned += del_count
        except Exception as e:
            logger.warning(f"Failed to cleanup expired jobs from jobs.db: {e}")

    if SYNCED_JOBS_DB_PATH.exists():
        try:
            with sqlite3.connect(str(SYNCED_JOBS_DB_PATH)) as conn:
                cursor = conn.cursor()
                cursor.execute("PRAGMA table_info(jobs)")
                cols = {row[1] for row in cursor.fetchall()}
                if "closing_date_iso" in cols:
                    cursor.execute("DELETE FROM jobs WHERE closing_date_iso IS NOT NULL AND closing_date_iso < ?", (today_iso,))
                    del_count = cursor.rowcount
                    conn.commit()
                    if del_count > 0:
                        logger.info(f"Cleaned up {del_count} expired jobs from synced_jobs.db")
                    total_cleaned += del_count
        except Exception as e:
            logger.warning(f"Failed to cleanup expired jobs from synced_jobs.db: {e}")

    return total_cleaned


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

    closing_iso = job_data.get("closing_date_iso") or parse_closing_date_to_iso(job_data.get("closing_date"))
    today_iso = date.today().isoformat()

    # If job is already expired, delete if it exists and do not insert
    if closing_iso and closing_iso < today_iso:
        if is_jobs_db_writable():
            try:
                with get_db_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute("DELETE FROM jobs WHERE reference_number = ?", (ref,))
                    conn.commit()
            except Exception:
                pass
        return False

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
                    closing_date_iso = COALESCE(?, closing_date_iso),
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
                closing_iso,
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
                    closing_date, closing_date_iso, job_url, logo_url,
                    first_seen_at, last_scraped_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                closing_iso,
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
                contract_type = COALESCE(?, contract_type),
                number_of_jobs = COALESCE(?, number_of_jobs)
            WHERE reference_number = ?
        """, (
            metadata.get("job_grade"),
            metadata.get("role_type"),
            metadata.get("working_pattern"),
            metadata.get("contract_type"),
            metadata.get("number_of_jobs"),
            ref
        ))
        conn.commit()
        return cursor.rowcount > 0


def init_synced_jobs_db():
    """Ensure the synced jobs SQLite database schema matches primary jobs table."""
    try:
        SYNCED_JOBS_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(str(SYNCED_JOBS_DB_PATH)) as conn:
            cursor = conn.cursor()
            cursor.execute("PRAGMA table_info(jobs)")
            info = cursor.fetchall()
            if info:
                existing_cols = [r[1] for r in info]
                if existing_cols != CANONICAL_JOB_COLUMNS:
                    # Drop legacy/mismatched table so it recreates cleanly
                    cursor.execute("DROP TABLE jobs")

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS jobs (
                    reference_number TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    department TEXT,
                    location TEXT,
                    salary TEXT,
                    closing_date TEXT,
                    job_url TEXT,
                    logo_url TEXT,
                    first_seen_at TEXT NOT NULL,
                    last_scraped_at TEXT NOT NULL,
                    salary_min INTEGER,
                    salary_max INTEGER,
                    job_grade TEXT,
                    role_type TEXT,
                    working_pattern TEXT,
                    contract_type TEXT,
                    number_of_jobs INTEGER DEFAULT 1,
                    closing_date_iso TEXT
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_synced_jobs_dept ON jobs(department)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_synced_jobs_first_seen ON jobs(first_seen_at)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_synced_jobs_closing ON jobs(closing_date)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_synced_jobs_closing_iso ON jobs(closing_date_iso)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_synced_jobs_num_jobs ON jobs(number_of_jobs)")
            conn.commit()
    except Exception as e:
        logger.warning(f"Failed to initialize synced_jobs_db: {e}")


def sync_live_jobs(jobs_list: List[Dict]) -> Dict:
    """
    Sync incoming scraped jobs into live storage.
    Writes to SYNCED_JOBS_DB_PATH, and also updates primary JOBS_DB_PATH if writable.
    Returns summary statistics.
    """
    init_synced_jobs_db()
    inserted_count = 0
    updated_count = 0
    now_iso = datetime.now().isoformat()
    today_iso = date.today().isoformat()

    try:
        with sqlite3.connect(str(SYNCED_JOBS_DB_PATH)) as conn:
            cursor = conn.cursor()
            for job in jobs_list:
                ref = str(job.get("reference_number", "")).strip()
                if not ref:
                    continue

                # Calculate salary bounds if needed
                s_min = job.get("salary_min")
                s_max = job.get("salary_max")
                if s_min is None and s_max is None and job.get("salary"):
                    s_min, s_max = parse_salary_range(job.get("salary"))

                closing_iso = job.get("closing_date_iso") or parse_closing_date_to_iso(job.get("closing_date"))

                # If job is expired, delete and skip
                if closing_iso and closing_iso < today_iso:
                    cursor.execute("DELETE FROM jobs WHERE reference_number = ?", (ref,))
                    continue

                num_jobs = job.get("number_of_jobs", 1)
                first_seen = job.get("first_seen_at") or now_iso
                last_scraped = job.get("last_scraped_at") or now_iso

                cursor.execute("SELECT 1 FROM jobs WHERE reference_number = ?", (ref,))
                if cursor.fetchone():
                    # Update
                    cursor.execute("""
                        UPDATE jobs SET
                            title = ?, department = ?, location = ?, salary = ?,
                            closing_date = ?, job_url = ?, logo_url = ?, last_scraped_at = ?,
                            salary_min = COALESCE(?, salary_min), salary_max = COALESCE(?, salary_max),
                            job_grade = COALESCE(?, job_grade), role_type = COALESCE(?, role_type),
                            working_pattern = COALESCE(?, working_pattern), contract_type = COALESCE(?, contract_type),
                            number_of_jobs = COALESCE(?, number_of_jobs),
                            closing_date_iso = COALESCE(?, closing_date_iso)
                        WHERE reference_number = ?
                    """, (
                        job.get("title", ""), job.get("department", ""), job.get("location", ""), job.get("salary", ""),
                        job.get("closing_date", ""), job.get("job_url", ""), job.get("logo_url", ""), last_scraped,
                        s_min, s_max, job.get("job_grade"), job.get("role_type"),
                        job.get("working_pattern"), job.get("contract_type"),
                        num_jobs, closing_iso, ref
                    ))
                    updated_count += 1
                else:
                    # Insert using canonical columns
                    cursor.execute(f"""
                        INSERT INTO jobs ({CANONICAL_JOB_COLUMNS_SQL})
                        VALUES ({', '.join(['?'] * len(CANONICAL_JOB_COLUMNS))})
                    """, (
                        ref, job.get("title", ""), job.get("department", ""), job.get("location", ""), job.get("salary", ""),
                        job.get("closing_date", ""), job.get("job_url", ""), job.get("logo_url", ""),
                        first_seen, last_scraped, s_min, s_max,
                        job.get("job_grade"), job.get("role_type"), job.get("working_pattern"), job.get("contract_type"),
                        num_jobs, closing_iso
                    ))
                    inserted_count += 1
            conn.commit()
    except Exception as e:
        logger.error(f"Error syncing jobs to synced_jobs.db: {e}")
        raise

    # If primary local database is writable, also upsert there
    if is_jobs_db_writable():
        for job in jobs_list:
            try:
                upsert_job(job)
            except Exception:
                pass

    # Run cleanup of expired jobs across catalogs
    cleanup_expired_jobs()

    total_jobs = count_jobs()
    return {
        "received": len(jobs_list),
        "inserted": inserted_count,
        "updated": updated_count,
        "total_jobs_in_catalog": total_jobs
    }



def get_today_new_jobs(limit: Optional[int] = None) -> List[Dict]:
    """Retrieve all active jobs first detected today (for live syncing to production)."""
    today_prefix = date.today().isoformat() + "%"
    today_iso = date.today().isoformat()
    with get_jobs_db_connection() as conn:
        tbl = get_jobs_table_target(conn)
        cursor = conn.cursor()
        query = f"SELECT * FROM {tbl} WHERE (closing_date_iso IS NULL OR closing_date_iso >= ?) AND first_seen_at LIKE ? ORDER BY first_seen_at DESC"
        if limit:
            query += f" LIMIT {int(limit)}"
            cursor.execute(query, (today_iso, today_prefix))
        else:
            cursor.execute(query, (today_iso, today_prefix))
        return [dict(row) for row in cursor.fetchall()]


def _normalize_filter_list(val: Any) -> List[str]:
    """Normalize input (list, set, tuple, or single string) into a list of non-empty strings without splitting valid names containing commas."""
    if val is None:
        return []
    if isinstance(val, (list, set, tuple)):
        result = []
        for item in val:
            if item is None:
                continue
            s = str(item).strip()
            if s and s not in result:
                result.append(s)
        return result
    if isinstance(val, str):
        s = val.strip()
        return [s] if s else []
    return [str(val).strip()]


def _build_jobs_where_clause(
    search: str = "",
    department: Union[str, List[str]] = "",
    departments: Optional[List[str]] = None,
    exclude_departments: Optional[List[str]] = None,
    location: Union[str, List[str]] = "",
    locations: Optional[List[str]] = None,
    exclude_locations: Optional[List[str]] = None,
    min_salary: Optional[int] = None,
    max_salary: Optional[int] = None,
    job_grade: Union[str, List[str]] = "",
    job_grades: Optional[List[str]] = None,
    exclude_job_grades: Optional[List[str]] = None,
    role_type: Union[str, List[str]] = "",
    role_types: Optional[List[str]] = None,
    exclude_role_types: Optional[List[str]] = None,
    working_pattern: Union[str, List[str]] = "",
    working_patterns: Optional[List[str]] = None,
    exclude_working_patterns: Optional[List[str]] = None,
    contract_type: Union[str, List[str]] = "",
    contract_types: Optional[List[str]] = None,
    exclude_contract_types: Optional[List[str]] = None,
    number_of_jobs: str = "",
    only_new_today: bool = False
) -> Tuple[str, List[Any]]:
    """Construct SQL WHERE clause and parameter list supporting multi-selection and exclusions."""
    where_clauses: List[str] = []
    params: List[Any] = []

    # Free text search
    if search and search.strip():
        where_clauses.append("(title LIKE ? OR department LIKE ? OR location LIKE ? OR reference_number LIKE ?)")
        s_pattern = f"%{search.strip()}%"
        params.extend([s_pattern, s_pattern, s_pattern, s_pattern])

    # Department inclusion
    inc_depts = _normalize_filter_list(departments) + _normalize_filter_list(department)
    inc_depts = list(dict.fromkeys(inc_depts))
    if inc_depts:
        placeholders = ", ".join(["?"] * len(inc_depts))
        where_clauses.append(f"department IN ({placeholders})")
        params.extend(inc_depts)

    # Department exclusion
    exc_depts = list(dict.fromkeys(_normalize_filter_list(exclude_departments)))
    if exc_depts:
        placeholders = ", ".join(["?"] * len(exc_depts))
        where_clauses.append(f"(department NOT IN ({placeholders}) OR department IS NULL)")
        params.extend(exc_depts)

    # Location inclusion
    inc_locs = _normalize_filter_list(locations) + _normalize_filter_list(location)
    inc_locs = list(dict.fromkeys(inc_locs))
    if inc_locs:
        is_all = any(l.strip().upper() in ("ALL", "ALL LOCATIONS", "ALL LOCATION", "ANY", "ANY LOCATION") for l in inc_locs)
        if not is_all:
            loc_clauses = []
            for loc in inc_locs:
                if loc.lower() in ("remote", "national / remote", "remote working", "remote working (anywhere in the uk)"):
                    loc_clauses.append("(location LIKE '%Remote%' OR location LIKE '%National%')")
                else:
                    loc_clauses.append("location LIKE ?")
                    params.append(f"%{loc}%")
            if loc_clauses:
                where_clauses.append(f"({' OR '.join(loc_clauses)})")


    # Location exclusion
    exc_locs = list(dict.fromkeys(_normalize_filter_list(exclude_locations)))
    if exc_locs:
        for loc in exc_locs:
            where_clauses.append("(location NOT LIKE ? OR location IS NULL)")
            params.append(f"%{loc}%")

    # Role types inclusion
    inc_roles = _normalize_filter_list(role_types) + _normalize_filter_list(role_type)
    inc_roles = list(dict.fromkeys(inc_roles))
    if inc_roles:
        or_clauses = ["role_type LIKE ?" for _ in inc_roles]
        where_clauses.append(f"({' OR '.join(or_clauses)})")
        params.extend([f"%{r}%" for r in inc_roles])

    # Role types exclusion
    exc_roles = list(dict.fromkeys(_normalize_filter_list(exclude_role_types)))
    if exc_roles:
        for r in exc_roles:
            where_clauses.append("(role_type NOT LIKE ? OR role_type IS NULL)")
            params.append(f"%{r}%")

    # Job grade inclusion
    inc_grades = _normalize_filter_list(job_grades) + _normalize_filter_list(job_grade)
    inc_grades = list(dict.fromkeys(inc_grades))
    if inc_grades:
        or_clauses = ["job_grade LIKE ?" for _ in inc_grades]
        where_clauses.append(f"({' OR '.join(or_clauses)})")
        params.extend([f"%{g}%" for g in inc_grades])

    # Job grade exclusion
    exc_grades = list(dict.fromkeys(_normalize_filter_list(exclude_job_grades)))
    if exc_grades:
        for g in exc_grades:
            where_clauses.append("(job_grade NOT LIKE ? OR job_grade IS NULL)")
            params.append(f"%{g}%")

    # Working pattern inclusion
    inc_patterns = _normalize_filter_list(working_patterns) + _normalize_filter_list(working_pattern)
    inc_patterns = list(dict.fromkeys(inc_patterns))
    if inc_patterns:
        or_clauses = ["working_pattern LIKE ?" for _ in inc_patterns]
        where_clauses.append(f"({' OR '.join(or_clauses)})")
        params.extend([f"%{p}%" for p in inc_patterns])

    # Working pattern exclusion
    exc_patterns = list(dict.fromkeys(_normalize_filter_list(exclude_working_patterns)))
    if exc_patterns:
        for p in exc_patterns:
            where_clauses.append("(working_pattern NOT LIKE ? OR working_pattern IS NULL)")
            params.append(f"%{p}%")

    # Contract type inclusion
    inc_contracts = _normalize_filter_list(contract_types) + _normalize_filter_list(contract_type)
    inc_contracts = list(dict.fromkeys(inc_contracts))
    if inc_contracts:
        or_clauses = ["contract_type LIKE ?" for _ in inc_contracts]
        where_clauses.append(f"({' OR '.join(or_clauses)})")
        params.extend([f"%{c}%" for c in inc_contracts])

    # Contract type exclusion
    exc_contracts = list(dict.fromkeys(_normalize_filter_list(exclude_contract_types)))
    if exc_contracts:
        for c in exc_contracts:
            where_clauses.append("(contract_type NOT LIKE ? OR contract_type IS NULL)")
            params.append(f"%{c}%")

    # Salary thresholds
    if min_salary is not None and min_salary > 0:
        where_clauses.append("(salary_max >= ? OR (salary_max IS NULL AND salary_min >= ?))")
        params.extend([min_salary, min_salary])

    if max_salary is not None and max_salary > 0:
        where_clauses.append("(salary_min <= ? OR (salary_min IS NULL AND salary_max <= ?))")
        params.extend([max_salary, max_salary])

    # Number of posts filter
    if number_of_jobs:
        if number_of_jobs == "1":
            where_clauses.append("(number_of_jobs = 1 OR number_of_jobs IS NULL)")
        elif number_of_jobs in ("2+", "2"):
            where_clauses.append("number_of_jobs >= 2")
        elif number_of_jobs in ("3+", "3"):
            where_clauses.append("number_of_jobs >= 3")
        elif number_of_jobs in ("5+", "5"):
            where_clauses.append("number_of_jobs >= 5")
        elif number_of_jobs in ("10+", "10"):
            where_clauses.append("number_of_jobs >= 10")
        else:
            try:
                n = int(number_of_jobs.rstrip("+"))
                where_clauses.append("number_of_jobs >= ?")
                params.append(n)
            except ValueError:
                pass

    # Only new today filter
    if only_new_today:
        today_prefix = date.today().isoformat() + "%"
        where_clauses.append("first_seen_at LIKE ?")
        params.append(today_prefix)

    # Exclude expired jobs across all queries
    today_iso = date.today().isoformat()
    where_clauses.append("(closing_date_iso IS NULL OR closing_date_iso >= ?)")
    params.append(today_iso)

    sql_where = (" WHERE " + " AND ".join(where_clauses)) if where_clauses else " WHERE 1=1"
    return sql_where, params


def get_jobs(
    search: str = "",
    department: Union[str, List[str]] = "",
    departments: Optional[List[str]] = None,
    exclude_departments: Optional[List[str]] = None,
    location: Union[str, List[str]] = "",
    locations: Optional[List[str]] = None,
    exclude_locations: Optional[List[str]] = None,
    min_salary: Optional[int] = None,
    max_salary: Optional[int] = None,
    job_grade: Union[str, List[str]] = "",
    job_grades: Optional[List[str]] = None,
    exclude_job_grades: Optional[List[str]] = None,
    role_type: Union[str, List[str]] = "",
    role_types: Optional[List[str]] = None,
    exclude_role_types: Optional[List[str]] = None,
    working_pattern: Union[str, List[str]] = "",
    working_patterns: Optional[List[str]] = None,
    exclude_working_patterns: Optional[List[str]] = None,
    contract_type: Union[str, List[str]] = "",
    contract_types: Optional[List[str]] = None,
    exclude_contract_types: Optional[List[str]] = None,
    number_of_jobs: str = "",
    only_new_today: bool = False,
    sort_by: str = "first_seen_at",
    sort_order: str = "desc",
    limit: int = 50,
    offset: int = 0
) -> List[Dict]:
    """Retrieve jobs based on combined filters, multi-selections, exclusions, and sorting."""
    where_sql, params = _build_jobs_where_clause(
        search=search,
        department=department,
        departments=departments,
        exclude_departments=exclude_departments,
        location=location,
        locations=locations,
        exclude_locations=exclude_locations,
        min_salary=min_salary,
        max_salary=max_salary,
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

    allowed_sorts = {
        "first_seen_at": "first_seen_at",
        "closing_date": "COALESCE(closing_date_iso, closing_date)",
        "title": "title",
        "department": "department",
        "salary_min": "salary_min",
        "salary_max": "salary_max",
    }
    safe_sort = allowed_sorts.get(sort_by, "first_seen_at")
    safe_order = "ASC" if sort_order.lower() == "asc" else "DESC"

    query = f"SELECT * FROM jobs {where_sql} ORDER BY {safe_sort} {safe_order} LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    with get_db_connection() as conn:
        tbl = get_jobs_table_target(conn)
        if tbl != "jobs":
            query = query.replace("FROM jobs", f"FROM {tbl}", 1)
        cursor = conn.cursor()
        cursor.execute(query, params)
        rows = cursor.fetchall()
        return [dict(row) for row in rows]


def count_jobs(
    search: str = "",
    department: Union[str, List[str]] = "",
    departments: Optional[List[str]] = None,
    exclude_departments: Optional[List[str]] = None,
    location: Union[str, List[str]] = "",
    locations: Optional[List[str]] = None,
    exclude_locations: Optional[List[str]] = None,
    min_salary: Optional[int] = None,
    max_salary: Optional[int] = None,
    job_grade: Union[str, List[str]] = "",
    job_grades: Optional[List[str]] = None,
    exclude_job_grades: Optional[List[str]] = None,
    role_type: Union[str, List[str]] = "",
    role_types: Optional[List[str]] = None,
    exclude_role_types: Optional[List[str]] = None,
    working_pattern: Union[str, List[str]] = "",
    working_patterns: Optional[List[str]] = None,
    exclude_working_patterns: Optional[List[str]] = None,
    contract_type: Union[str, List[str]] = "",
    contract_types: Optional[List[str]] = None,
    exclude_contract_types: Optional[List[str]] = None,
    number_of_jobs: str = "",
    only_new_today: bool = False
) -> int:
    """Count total jobs matching all current filter conditions including multi-selections and exclusions."""
    where_sql, params = _build_jobs_where_clause(
        search=search,
        department=department,
        departments=departments,
        exclude_departments=exclude_departments,
        location=location,
        locations=locations,
        exclude_locations=exclude_locations,
        min_salary=min_salary,
        max_salary=max_salary,
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

    query = f"SELECT COUNT(*) FROM jobs {where_sql}"

    with get_db_connection() as conn:
        tbl = get_jobs_table_target(conn)
        if tbl != "jobs":
            query = query.replace("FROM jobs", f"FROM {tbl}", 1)
        cursor = conn.cursor()
        cursor.execute(query, params)
        return cursor.fetchone()[0]


def get_job_by_reference(reference_number: str) -> Optional[Dict]:
    """Retrieve full job post details for a single reference number."""
    with get_db_connection() as conn:
        tbl = get_jobs_table_target(conn)
        cursor = conn.cursor()
        cursor.execute(f"SELECT * FROM {tbl} WHERE reference_number = ?", (reference_number,))
        row = cursor.fetchone()
        return dict(row) if row else None


def get_departments() -> List[str]:
    """Get unique list of departments for active jobs."""
    today_iso = date.today().isoformat()
    with get_db_connection() as conn:
        tbl = get_jobs_table_target(conn)
        cursor = conn.cursor()
        cursor.execute(f"SELECT DISTINCT department FROM {tbl} WHERE (closing_date_iso IS NULL OR closing_date_iso >= ?) AND department IS NOT NULL AND department != '' ORDER BY department ASC", (today_iso,))
        return [row[0] for row in cursor.fetchall()]


def get_job_grades() -> List[str]:
    """Get unique list of job grades for active jobs."""
    today_iso = date.today().isoformat()
    with get_db_connection() as conn:
        tbl = get_jobs_table_target(conn)
        cursor = conn.cursor()
        cursor.execute(f"SELECT DISTINCT job_grade FROM {tbl} WHERE (closing_date_iso IS NULL OR closing_date_iso >= ?) AND job_grade IS NOT NULL AND job_grade != '' ORDER BY job_grade ASC", (today_iso,))
        return [row[0] for row in cursor.fetchall()]


def get_role_types() -> List[str]:
    """Get unique list of role types for active jobs."""
    today_iso = date.today().isoformat()
    with get_db_connection() as conn:
        tbl = get_jobs_table_target(conn)
        cursor = conn.cursor()
        cursor.execute(f"SELECT DISTINCT role_type FROM {tbl} WHERE (closing_date_iso IS NULL OR closing_date_iso >= ?) AND role_type IS NOT NULL AND role_type != '' ORDER BY role_type ASC", (today_iso,))
        # Role types can be comma separated
        unique_roles = set()
        for row in cursor.fetchall():
            for role in row[0].split(","):
                clean = role.strip()
                if clean:
                    unique_roles.add(clean)
        return sorted(list(unique_roles))


def get_contract_types() -> List[str]:
    """Get unique list of contract types for active jobs."""
    today_iso = date.today().isoformat()
    with get_db_connection() as conn:
        tbl = get_jobs_table_target(conn)
        cursor = conn.cursor()
        cursor.execute(f"SELECT DISTINCT contract_type FROM {tbl} WHERE (closing_date_iso IS NULL OR closing_date_iso >= ?) AND contract_type IS NOT NULL AND contract_type != '' ORDER BY contract_type ASC", (today_iso,))
        unique_contracts = set()
        for row in cursor.fetchall():
            for c in row[0].split(","):
                clean = c.strip()
                if clean:
                    unique_contracts.add(clean)
        return sorted(list(unique_contracts))


def get_working_patterns() -> List[str]:
    """Get unique list of working patterns for active jobs."""
    today_iso = date.today().isoformat()
    with get_db_connection() as conn:
        tbl = get_jobs_table_target(conn)
        cursor = conn.cursor()
        cursor.execute(f"SELECT DISTINCT working_pattern FROM {tbl} WHERE (closing_date_iso IS NULL OR closing_date_iso >= ?) AND working_pattern IS NOT NULL AND working_pattern != '' ORDER BY working_pattern ASC", (today_iso,))
        unique_patterns = set()
        for row in cursor.fetchall():
            for p in row[0].split(","):
                clean = p.strip()
                if clean:
                    unique_patterns.add(clean)
        return sorted(list(unique_patterns))


def get_filter_options() -> Dict:
    """Retrieve all available facet filter options in a single call."""
    today_iso = date.today().isoformat()
    with get_db_connection() as conn:
        tbl = get_jobs_table_target(conn)
        cursor = conn.cursor()
        cursor.execute(f"SELECT MIN(salary_min), MAX(salary_max) FROM {tbl} WHERE (closing_date_iso IS NULL OR closing_date_iso >= ?) AND salary_min > 0", (today_iso,))
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
    """Return active jobs that have not yet had their detail page metadata scraped."""
    today_iso = date.today().isoformat()
    with get_db_connection() as conn:
        tbl = get_jobs_table_target(conn)
        cursor = conn.cursor()
        cursor.execute(f"""
            SELECT reference_number, job_url, title
            FROM {tbl}
            WHERE (closing_date_iso IS NULL OR closing_date_iso >= ?)
              AND (job_grade IS NULL OR role_type IS NULL OR contract_type IS NULL)
            LIMIT ?
        """, (today_iso, limit))
        return [dict(row) for row in cursor.fetchall()]


def count_jobs_missing_details() -> int:
    """Count active jobs that do not yet have detail metadata."""
    today_iso = date.today().isoformat()
    with get_db_connection() as conn:
        tbl = get_jobs_table_target(conn)
        cursor = conn.cursor()
        cursor.execute(f"""
            SELECT COUNT(*) FROM {tbl}
            WHERE (closing_date_iso IS NULL OR closing_date_iso >= ?)
              AND (job_grade IS NULL OR role_type IS NULL OR contract_type IS NULL)
        """, (today_iso,))
        return cursor.fetchone()[0]


def get_dashboard_stats() -> Dict:
    """Calculate aggregate statistics for dashboard metrics excluding expired jobs."""
    today_prefix = date.today().isoformat() + "%"
    today_iso = date.today().isoformat()
    with get_db_connection() as conn:
        tbl = get_jobs_table_target(conn)
        cursor = conn.cursor()
        
        cursor.execute(f"SELECT COUNT(*) FROM {tbl} WHERE (closing_date_iso IS NULL OR closing_date_iso >= ?)", (today_iso,))
        total_jobs = cursor.fetchone()[0]
        
        cursor.execute(f"SELECT COUNT(*) FROM {tbl} WHERE (closing_date_iso IS NULL OR closing_date_iso >= ?) AND first_seen_at LIKE ?", (today_iso, today_prefix))
        new_jobs_today = cursor.fetchone()[0]
        
        cursor.execute(f"SELECT COUNT(DISTINCT department) FROM {tbl} WHERE (closing_date_iso IS NULL OR closing_date_iso >= ?) AND department IS NOT NULL AND department != ''", (today_iso,))
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


def get_primary_resume_record(user_id: int) -> Optional[Dict]:
    """Fetch primary resume record for a user, or the most recent resume."""
    with get_users_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, user_id, filename, description, file_content, file_size, content_type, is_primary, uploaded_at
            FROM user_resumes
            WHERE user_id = ?
            ORDER BY is_primary DESC, id DESC
            LIMIT 1
        """, (user_id,))
        row = cursor.fetchone()
        return dict(row) if row else None


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


# ==========================================
# Personal Statements (Per Advert & Per CV)
# ==========================================

def get_personal_statement(
    job_reference: str,
    resume_id: int = 0,
    cv_hash: str = "",
    user_id: int = 0
) -> Optional[Dict]:
    """Fetch saved personal statement for a specific job advert and CV."""
    with get_users_db_connection() as conn:
        cursor = conn.cursor()
        # 1. Match by resume_id if available (> 0)
        if resume_id and resume_id > 0:
            cursor.execute(
                """
                SELECT * FROM personal_statements
                WHERE job_reference = ? AND resume_id = ? AND user_id = ?
                ORDER BY updated_at DESC LIMIT 1
                """,
                (job_reference, resume_id, user_id)
            )
            row = cursor.fetchone()
            if row:
                return dict(row)

        # 2. Match by cv_hash if available
        if cv_hash:
            cursor.execute(
                """
                SELECT * FROM personal_statements
                WHERE job_reference = ? AND cv_hash = ? AND user_id = ?
                ORDER BY updated_at DESC LIMIT 1
                """,
                (job_reference, cv_hash, user_id)
            )
            row = cursor.fetchone()
            if row:
                return dict(row)

        # 3. Fallback: match by job_reference and user_id
        cursor.execute(
            """
            SELECT * FROM personal_statements
            WHERE job_reference = ? AND user_id = ?
            ORDER BY updated_at DESC LIMIT 1
            """,
            (job_reference, user_id)
        )
        row = cursor.fetchone()
        if row:
            return dict(row)

        return None


def save_personal_statement(
    job_reference: str,
    resume_id: int = 0,
    user_id: int = 0,
    cv_hash: str = "",
    cv_name: str = "",
    statement_text: str = "",
    word_count: int = 0,
    target_words: int = 750,
    additional_notes: str = "",
    model_used: str = "openai"
) -> Dict:
    """Save or update generated personal statement for a specific job advert and CV."""
    now_iso = datetime.now().isoformat()
    with get_users_db_connection() as conn:
        cursor = conn.cursor()
        # Check if record already exists for this (job_reference, resume_id, user_id)
        cursor.execute(
            """
            SELECT id FROM personal_statements
            WHERE job_reference = ? AND resume_id = ? AND user_id = ?
            """,
            (job_reference, resume_id, user_id)
        )
        existing = cursor.fetchone()

        # If not found by resume_id but cv_hash exists, check by cv_hash
        if not existing and cv_hash:
            cursor.execute(
                """
                SELECT id FROM personal_statements
                WHERE job_reference = ? AND cv_hash = ? AND user_id = ?
                """,
                (job_reference, cv_hash, user_id)
            )
            existing = cursor.fetchone()

        if existing:
            cursor.execute(
                """
                UPDATE personal_statements
                SET cv_hash = ?, cv_name = ?, statement_text = ?, word_count = ?,
                    target_words = ?, additional_notes = ?, model_used = ?, updated_at = ?
                WHERE id = ?
                """,
                (cv_hash, cv_name, statement_text, word_count, target_words, additional_notes, model_used, now_iso, existing["id"])
            )
            conn.commit()
            record_id = existing["id"]
        else:
            cursor.execute(
                """
                INSERT INTO personal_statements (
                    user_id, job_reference, resume_id, cv_hash, cv_name,
                    statement_text, word_count, target_words, additional_notes,
                    model_used, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (user_id, job_reference, resume_id, cv_hash, cv_name,
                 statement_text, word_count, target_words, additional_notes,
                 model_used, now_iso, now_iso)
            )
            conn.commit()
            record_id = cursor.lastrowid

        cursor.execute("SELECT * FROM personal_statements WHERE id = ?", (record_id,))
        return dict(cursor.fetchone())


# Run initialization on import
try:
    init_db()
except Exception as e:
    logger.warning(f"Database initialization deferred or skipped: {e}")

