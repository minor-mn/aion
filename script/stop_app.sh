#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_ROOT"

SERVER_PID_FILE="tmp/pids/rails_server.pid"
JOBS_PID_FILE="tmp/pids/jobs.pid"

stop_process() {
  local name="$1"
  local pid_file="$2"

  if [[ ! -f "$pid_file" ]]; then
    echo "$name is not running"
    return 0
  fi

  local pid
  pid="$(cat "$pid_file")"
  if [[ -z "$pid" ]]; then
    rm -f "$pid_file"
    echo "$name pid file was empty"
    return 0
  fi

  if ! kill -0 "$pid" 2>/dev/null; then
    rm -f "$pid_file"
    echo "$name is not running"
    return 0
  fi

  kill "$pid"

  for _ in {1..30}; do
    if ! kill -0 "$pid" 2>/dev/null; then
      rm -f "$pid_file"
      echo "stopped $name"
      return 0
    fi
    sleep 1
  done

  kill -9 "$pid"
  rm -f "$pid_file"
  echo "force stopped $name"
}

stop_process "jobs" "$JOBS_PID_FILE"
stop_process "rails server" "$SERVER_PID_FILE"
