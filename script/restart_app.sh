#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$APP_ROOT/script/stop_app.sh"
"$APP_ROOT/script/start_app.sh"
