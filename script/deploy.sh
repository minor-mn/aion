#!/usr/bin/env bash
# 本番サーバ上で、リリースするタグをチェックアウトしたあとに実行する。
# GitHub Actions の Deploy ワークフローから呼ばれる。
set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_ROOT"

export RAILS_ENV=production

echo "deploying $(git describe --tags --exact-match 2>/dev/null || true) ($(git rev-parse HEAD))"

bundle install
bundle exec rails db:migrate
# SSH セッションの stdin を引き継いだまま puma が残らないようにする
script/restart_app.sh </dev/null
