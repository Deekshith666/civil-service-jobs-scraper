"""Unified command-line interface for Civil Service Jobs Scraper and Dashboard."""

import argparse
import sys
import uvicorn

import database
from config import DEFAULT_HOST, DEFAULT_PORT, DEFAULT_SCHEDULE_HOUR, DEFAULT_SCHEDULE_MINUTE
from scraper import CivilServiceScraper
from scheduler import start_scheduler


def cmd_scrape(args):
    """Execute a scraping run directly from CLI."""
    print(f"==> Initiating Civil Service Jobs scrape (mode: {args.mode}, max_pages: {args.max_pages})...")
    scraper = CivilServiceScraper()
    result = scraper.scrape(mode=args.mode, max_pages=args.max_pages)
    
    print("\nScrape Execution Summary:")
    print("-" * 40)
    print(f"Status:          {result['status'].upper()}")
    print(f"Mode:            {result['mode']}")
    print(f"Pages Scraped:   {result['pages_scraped']}")
    print(f"Jobs Found:      {result['jobs_found']}")
    print(f"New Jobs Added:  {result['new_jobs_added']}")
    print(f"Duration:        {result['duration_seconds']} seconds")
    if result.get("error"):
        print(f"Error Message:   {result['error']}")
    print("-" * 40)


def cmd_serve(args):
    """Launch the interactive web dashboard server."""
    print(f"==> Starting Civil Service Jobs Dashboard on http://{args.host}:{args.port}")
    uvicorn.run("app:app", host=args.host, port=args.port, reload=args.reload)


def cmd_schedule(args):
    """Start the daily automated background scheduler."""
    try:
        hour, minute = map(int, args.time.split(":"))
    except ValueError:
        print("Error: Invalid time format. Please provide HH:MM (e.g. 08:00)")
        sys.exit(1)

    print(f"==> Launching daily scheduler set for {hour:02d}:{minute:02d} daily...")
    start_scheduler(hour=hour, minute=minute, run_now=args.run_now)


def cmd_stats(args):
    """Display current database summary statistics."""
    stats = database.get_dashboard_stats()
    print("\nCivil Service Jobs - Database Statistics:")
    print("=" * 45)
    print(f"Total Jobs Stored:      {stats['total_jobs']}")
    print(f"New Jobs Today:         {stats['new_jobs_today']}")
    print(f"Unique Departments:     {stats['departments_count']}")
    
    last = stats.get("last_run")
    if last:
        print("\nLast Scrape Run:")
        print(f"  Timestamp:            {last['run_at']}")
        print(f"  Mode:                 {last['mode']}")
        print(f"  Pages Scraped:        {last['pages_scraped']}")
        print(f"  Jobs Found:           {last['jobs_found']}")
        print(f"  New Jobs Added:       {last['new_jobs_added']}")
        print(f"  Duration:             {last['duration_seconds']}s")
        print(f"  Status:               {last['status']}")
    else:
        print("\nNo scrape runs recorded yet.")
    print("=" * 45)


def cmd_enrich(args):
    """Enrich stored jobs with detailed metadata (grades, contracts, working patterns, roles)."""
    print(f"==> Initiating vacancy details enrichment (limit: {args.limit}, workers: {args.workers})...")
    scraper = CivilServiceScraper()
    count = scraper.enrich_jobs(limit=args.limit, max_workers=args.workers)
    print(f"==> Enrichment complete: {count} vacancies updated.")


def main():
    parser = argparse.ArgumentParser(
        description="UK Civil Service Jobs Daily Scraper & Interactive Screen"
    )
    subparsers = parser.add_subparsers(dest="command", help="Available subcommands")

    # Scrape command
    scrape_parser = subparsers.add_parser("scrape", help="Run the job scraper")
    scrape_parser.add_argument(
        "--mode",
        choices=["incremental", "full"],
        default="incremental",
        help="Scraping mode: incremental (stops on known jobs) or full (scrapes all pages)"
    )
    scrape_parser.add_argument(
        "--max-pages",
        type=int,
        default=None,
        help="Maximum pages to scrape (optional)"
    )

    # Enrich command
    enrich_parser = subparsers.add_parser("enrich", help="Enrich vacancies with detail page metadata")
    enrich_parser.add_argument("--limit", type=int, default=200, help="Number of vacancies to enrich (default: 200)")
    enrich_parser.add_argument("--workers", type=int, default=8, help="Number of concurrent workers (default: 8)")

    # Serve command
    serve_parser = subparsers.add_parser("serve", help="Start the web dashboard")
    serve_parser.add_argument("--host", default=DEFAULT_HOST, help=f"Host (default: {DEFAULT_HOST})")
    serve_parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"Port (default: {DEFAULT_PORT})")
    serve_parser.add_argument("--reload", action="store_true", help="Enable live auto-reload")

    # Schedule command
    sched_parser = subparsers.add_parser("schedule", help="Start daily automated scheduler")
    sched_parser.add_argument(
        "--time",
        default=f"{DEFAULT_SCHEDULE_HOUR:02d}:{DEFAULT_SCHEDULE_MINUTE:02d}",
        help="Daily execution time in HH:MM format (default: 08:00)"
    )
    sched_parser.add_argument(
        "--run-now",
        action="store_true",
        help="Execute an immediate scrape before entering the schedule loop"
    )

    # Stats command
    subparsers.add_parser("stats", help="Show database metrics and last run summary")

    args = parser.parse_args()

    if args.command == "scrape":
        cmd_scrape(args)
    elif args.command == "enrich":
        cmd_enrich(args)
    elif args.command == "serve":
        cmd_serve(args)
    elif args.command == "schedule":
        cmd_schedule(args)
    elif args.command == "stats":
        cmd_stats(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()

