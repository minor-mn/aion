#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <task>  (e.g. import_shifts)" >&2
  exit 64
fi

TASK="$1"
APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_ROOT"

mkdir -p log tmp/pids
LOG_FILE="log/cron.log"
LOCK_FILE="tmp/pids/cron_${TASK}.lock"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "cron_skip task=$TASK time=$(date "+%Y-%m-%dT%H:%M:%S%z") reason=still_running" >>"$LOG_FILE"
  exit 0
fi

echo "cron_start task=$TASK time=$(date "+%Y-%m-%dT%H:%M:%S%z")" >>"$LOG_FILE"
if bundle exec rails "aion:$TASK" >>"$LOG_FILE" 2>&1; then
  echo "cron_finish task=$TASK time=$(date "+%Y-%m-%dT%H:%M:%S%z")" >>"$LOG_FILE"
else
  status=$?
  echo "cron_failed task=$TASK time=$(date "+%Y-%m-%dT%H:%M:%S%z") status=$status" >>"$LOG_FILE"
  exit "$status"
fi
