#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_ROOT"

mkdir -p log tmp/pids tmp/sockets
touch log/server.log log/small_worker.log

SERVER_PID_FILE="tmp/pids/rails_server.pid"
SMALL_WORKER_PID_FILE="tmp/pids/small_worker.pid"
SERVER_LOG_FILE="log/server.log"
SMALL_WORKER_LOG_FILE="log/small_worker.log"

start_process() {
  local name="$1"
  local pid_file="$2"
  local log_file="$3"
  shift 3

  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file")"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      echo "$name is already running (pid: $pid)"
      return 0
    fi
    rm -f "$pid_file"
  fi

  nohup "$@" >>"$log_file" 2>&1 &
  local pid=$!
  echo "$pid" >"$pid_file"
  sleep 2

  if kill -0 "$pid" 2>/dev/null; then
    echo "started $name (pid: $pid)"
    return 0
  fi

  rm -f "$pid_file"
  echo "failed to start $name"
  tail -n 20 "$log_file" || true
  return 1
}

start_process "rails server" "$SERVER_PID_FILE" "$SERVER_LOG_FILE" bundle exec rails s
start_process "small worker" "$SMALL_WORKER_PID_FILE" "$SMALL_WORKER_LOG_FILE" "$APP_ROOT/script/small_worker_loop.sh"
