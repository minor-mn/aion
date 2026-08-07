#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_ROOT"

INTERVAL_SECONDS="${SMALL_WORKER_INTERVAL_SECONDS:-1800}"
active_pid=""

terminate() {
  if [[ -n "$active_pid" ]] && kill -0 "$active_pid" 2>/dev/null; then
    kill "$active_pid" 2>/dev/null || true
    wait "$active_pid" 2>/dev/null || true
  fi
  exit 0
}

trap terminate INT TERM

while true; do
  started_at="$(date +%s)"
  echo "small_worker_start time=$(date -Is)"

  bundle exec rails aion:small_worker &
  active_pid=$!
  if wait "$active_pid"; then
    echo "small_worker_finish time=$(date -Is)"
  else
    status=$?
    echo "small_worker_failed time=$(date -Is) status=$status"
  fi
  active_pid=""

  elapsed=$(( "$(date +%s)" - started_at ))
  sleep_for=$(( INTERVAL_SECONDS - elapsed ))
  if (( sleep_for < 1 )); then
    sleep_for=1
  fi

  sleep "$sleep_for" &
  active_pid=$!
  wait "$active_pid" || true
  active_pid=""
done
