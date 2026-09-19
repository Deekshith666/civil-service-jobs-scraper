"""Daily automated scheduler for Civil Service Jobs Scraper using APScheduler."""

import argparse
import logging
import signal
import sys
from datetime import datetime
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

from config import DEFAULT_SCHEDULE_HOUR, DEFAULT_SCHEDULE_MINUTE
from scraper import CivilServiceScraper
from sync_client import push_jobs_to_live

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("cs_scheduler")


def run_daily_scrape(mode: str = "incremental"):
    """Execute the scheduled job scrape task and sync new jobs to live."""
    logger.info(f"--- Triggering daily scrape job (mode={mode}) at {datetime.now()} ---")
    scraper = CivilServiceScraper()
    try:
        summary = scraper.scrape(mode=mode)
        new_jobs = summary.get("new_jobs") or []
        logger.info(
            f"Daily scrape finished successfully: "
            f"{summary.get('new_jobs_added', 0)} new jobs added out of "
            f"{summary.get('jobs_found', 0)} found across "
            f"{summary.get('pages_scraped', 0)} pages in {summary.get('duration_seconds', 0)}s."
        )

        # Automatically push newly discovered vacancies to live production
        if new_jobs:
            logger.info(f"Automatically syncing {len(new_jobs)} new jobs to live production...")
            push_jobs_to_live(new_jobs, source="daily_scheduled_cron")
        else:
            # Fallback: check if there are jobs first detected today to ensure live is up-to-date
            import database
            today_jobs = database.get_today_new_jobs()
            if today_jobs:
                logger.info(f"Syncing {len(today_jobs)} jobs detected today to live production...")
                push_jobs_to_live(today_jobs, source="daily_scheduled_cron_today_fallback")
            else:
                logger.info("No newly added jobs to sync to live production today.")
    except Exception as e:
        logger.error(f"Daily scrape failed with error: {e}")



def start_scheduler(hour: int = DEFAULT_SCHEDULE_HOUR, minute: int = DEFAULT_SCHEDULE_MINUTE, run_now: bool = False):
    """Start the blocking scheduler for daily execution."""
    scheduler = BlockingScheduler()

    # Schedule recurring daily job
    trigger = CronTrigger(hour=hour, minute=minute)
    scheduler.add_job(
        run_daily_scrape,
        trigger=trigger,
        args=["incremental"],
        id="daily_civil_service_scrape",
        name="Daily Civil Service Jobs Scraper",
        replace_existing=True,
    )

    logger.info(f"Daily scraper scheduled to run every day at {hour:02d}:{minute:02d}")

    # Graceful shutdown handler
    def handle_shutdown(signum, frame):
        logger.info("Received termination signal. Shutting down scheduler...")
        scheduler.shutdown(wait=False)
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)

    # Optional initial execution
    if run_now:
        logger.info("Executing immediate initial scrape run as requested (--run-now)...")
        run_daily_scrape(mode="incremental")

    try:
        logger.info("Scheduler started. Waiting for next trigger. Press Ctrl+C to stop.")
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Scheduler stopped.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Daily Civil Service Jobs Scraper Scheduler")
    parser.add_argument("--time", type=str, default=f"{DEFAULT_SCHEDULE_HOUR:02d}:{DEFAULT_SCHEDULE_MINUTE:02d}", help="Schedule time in HH:MM format (default: 08:00)")
    parser.add_argument("--run-now", action="store_true", help="Run scrape immediately before entering schedule loop")
    args = parser.parse_args()

    try:
        h, m = map(int, args.time.split(":"))
    except ValueError:
        logger.error("Invalid time format. Please use HH:MM (e.g. 08:00)")
        sys.exit(1)

    start_scheduler(hour=h, minute=m, run_now=args.run_now)
