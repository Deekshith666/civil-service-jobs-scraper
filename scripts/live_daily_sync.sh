#!/usr/bin/env bash
set -uo pipefail

PROJECT_DIR="/home/webteam/Documents/workspace/personal/civil-service-jobs-scraper"
LOG_DIR="${LOG_DIR:-$PROJECT_DIR/data}"
LOG_FILE="${LOG_FILE:-$LOG_DIR/live-sync.log}"
ALERT_EMAIL="${SYNC_ALERT_EMAIL:-}"
ALERT_WEBHOOK="${SYNC_WEBHOOK_URL:-}"

mkdir -p "$LOG_DIR"
exec >> "$LOG_FILE" 2>&1

echo "=== $(date -u +'%Y-%m-%d %H:%M:%S UTC') starting daily sync ==="

cd "$PROJECT_DIR"

if [ -f .venv/bin/activate ]; then
  . .venv/bin/activate
fi

python3 main.py scrape --mode incremental --target-url https://civil-service-jobs-scraper.vercel.app
status=$?

if [ "$status" -eq 0 ]; then
  echo "=== $(date -u +'%Y-%m-%d %H:%M:%S UTC') sync completed successfully ==="
  exit 0
fi

echo "=== $(date -u +'%Y-%m-%d %H:%M:%S UTC') sync failed with exit code $status ==="

if [ -n "$ALERT_EMAIL" ] && command -v mail >/dev/null 2>&1; then
  {
    echo "Subject: Civil Service Jobs sync failed"
    echo "To: $ALERT_EMAIL"
    echo "From: cron@local"
    echo
    echo "The daily civil-service-jobs sync failed on $(date -u +'%Y-%m-%d %H:%M:%S UTC')."
    echo "Project: $PROJECT_DIR"
    echo "Log file: $LOG_FILE"
    echo
    echo "Recent log output:"
    tail -n 40 "$LOG_FILE"
  } | sendmail "$ALERT_EMAIL" 2>/dev/null || true
fi

if [ -n "$ALERT_WEBHOOK" ] && command -v curl >/dev/null 2>&1; then
  curl -fsS -X POST \
    -H 'Content-Type: application/json' \
    --data "{\"text\":\"Civil Service Jobs sync failed on $(date -u +'%Y-%m-%d %H:%M:%S UTC')\"}" \
    "$ALERT_WEBHOOK" >/dev/null 2>&1 || true
fi

exit "$status"
