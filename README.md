# UK Civil Service Jobs Daily Scraper & Interactive Screen

An automated Python scraping system and web dashboard designed to track job postings on the UK Civil Service portal ([civilservicejobs.service.gov.uk](https://www.civilservicejobs.service.gov.uk)).

## Key Features

1. **Anti-Bot Challenge Solver (ALTCHA PoW)**:
   - Reverse-engineered, pure-Python SHA-512 proof-of-work solver that solves the portal's cryptographic verification in ~50ms without requiring heavy browser automation or third-party CAPTCHA solving services.
2. **Automated Search & Reverse Chronological Sorting**:
   - Submits the search form and dynamically applies `sort=opening` ("Most recent") so newly posted vacancies are always listed first.
3. **Daily Incremental Scraping**:
   - On the first day: Scrapes all available job pages to build the initial database.
   - From day 2 onwards: Checks the newest vacancies and halts as soon as previously scraped vacancies are encountered, minimizing network traffic and runtime.
4. **SQLite Database Storage**:
   - Stores job reference numbers, job titles, departments, locations, salaries, closing dates, direct advert URLs, logos, and timestamps (`first_seen_at`, `last_scraped_at`).
   - Audit trail in `scrape_logs` recording run timestamps, modes, duration, and new additions.
5. **Modern Web Dashboard**:
   - Glassmorphic dark/light theme interface.
   - Real-time search by keyword, department, location, or reference number.
   - "New Jobs Today" filter switch.
   - "Run Scraper Now" button with live status updates.
   - Direct links to job adverts on GOV.UK.
6. **Daily Background Scheduler**:
   - Built-in daily scheduler (via APScheduler) configurable for any time (default: 08:00 AM).

---

## Directory Structure

```
civil_service_jobs_scraper/
├── .venv/                  # Virtual environment
├── config.py               # Settings (URLs, timeout, schedule time, DB path)
├── database.py             # SQLite schemas, upsert, stats, and search queries
├── scraper.py              # CivilServiceScraper with ALTCHA solver & pagination
├── scheduler.py            # Daily cron-style runner
├── app.py                  # FastAPI server with REST APIs
├── main.py                 # Unified CLI tool
├── requirements.txt        # Python dependencies
├── pyproject.toml          # Project configuration
├── data/
│   └── jobs.db             # SQLite database file
├── templates/
│   └── index.html          # Dashboard HTML
└── static/
    ├── css/
    │   └── style.css       # Responsive glassmorphism styling
    └── js/
        └── app.js          # Dashboard frontend controller
```

---

## Installation & Setup

Ensure Python 3.10+ is installed (or use `uv`):

```bash
cd /Users/lshdr6/.gemini/antigravity-ide/scratch/civil_service_jobs_scraper

# Option A: With uv (recommended)
uv venv .venv
source .venv/bin/activate
uv pip install -r requirements.txt

# Option B: With standard python3 venv
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

---

## Usage

### 1. Unified CLI

The `main.py` entrypoint provides commands for all workflows:

```bash
# Run initial full scrape (e.g. 3 pages to start, or omit --max-pages for all)
.venv/bin/python main.py scrape --mode full --max-pages 3

# Run daily incremental scrape (scrapes only new jobs posted since last run)
.venv/bin/python main.py scrape --mode incremental

# Launch the Web Dashboard
.venv/bin/python main.py serve --port 8080

# Start the automated daily scheduler (runs every day at 08:00 AM)
.venv/bin/python main.py schedule --time 08:00

# Start scheduler and run an immediate scrape right away
.venv/bin/python main.py schedule --time 08:00 --run-now

# View current database statistics
.venv/bin/python main.py stats
```

---

### 2. Launching the Web Screen / Dashboard

Run:
```bash
.venv/bin/python main.py serve --port 8080
```
Open **http://127.0.0.1:8080** in your browser.

From the screen, you can:
- Browse jobs with instant keyword search
- Filter by department or toggle "Only New Today"
- Trigger a new scraping run directly using the **"Run Scraper Now"** button in the header
- View live progress (pages scanned, new jobs added)
- Check audit logs of all past scrape runs

---

### 3. Setting Up System Cron (Optional Alternative)

If you prefer using macOS/Linux standard `cron` instead of the Python scheduler daemon:

```bash
crontab -e
```

Add this line to run the incremental scrape every morning at 8:00 AM:
```cron
0 8 * * * cd /Users/lshdr6/.gemini/antigravity-ide/scratch/civil_service_jobs_scraper && .venv/bin/python main.py scrape --mode incremental >> data/cron.log 2>&1
```
