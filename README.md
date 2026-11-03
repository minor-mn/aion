# Aion API

This is a Ruby on Rails API application with Swagger UI documentation. Users sign in with passkeys on the auth server of [crystal-p2p-server](https://an.umr.biz/auth/), and this app verifies its access tokens with [umbra](https://github.com/minor-mn/umbra).

## Prerequisites

- Ruby 3.4+
- Rails 8.x
- PostgreSQL
- Bundler

## Setup Instructions

### 1. Clone the repository

```bash
git clone https://github.com/minor-mn/aion.git
cd aion
```

### 2. Install dependencies

```bash
bundle install
```

### 3. Set up environment variables

The auth server defaults to `https://an.umr.biz`. To use another one, set these in `.env`:

```env
AUTH_SERVER_URL=https://an.umr.biz
AUTH_BASE_PATH=/auth
AUTH_ISSUER=https://an.umr.biz
AUTH_AUDIENCE=umr
```

The browser talks to the auth server set by `<meta name="auth-server">` in `public/index.html`. A passkey can be used only on the origins the auth server allows (`allowed_origins` and `cors_allowed_origins`), so a local `http://localhost:3000` needs a local auth server that allows it.

### 4. Set up the database

```bash
bundle exec rails db:create db:migrate
```

### 5. Start the Rails server

```bash
bundle exec rails server -b 0.0.0.0
```

### 6. 管理者を設定

アプリを開き、画面右上の「サインイン」からパスキーで新規登録（またはサインイン）してください。そのあとで、ユーザー名を指定して管理者として設定します。

```bash
bundle exec rails console
```

```ruby
user = User.find_by!(username: "alice") # 認証サーバのユーザー名に置き換える
user.update!(role: :admin)
```

### 7. Access the API documentation

Open your browser and go to:

```
http://localhost:3000/openapi/index.html
```

You can now explore and test the API endpoints using Swagger UI.

## Ubuntu環境構築手順

Rubyがインストール済みの状態を前提とします（Ruby 3.4.4）。

### 1. 必要なパッケージのインストール

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib libpq-dev
```

### 2. PostgreSQLの起動とユーザー設定

```bash
sudo systemctl start postgresql
sudo systemctl enable postgresql

# 現在のUbuntuユーザー名でPostgreSQLロールを作成
sudo -u postgres createuser -s $(whoami)
```

### 3. リポジトリのクローンと依存関係のインストール

```bash
git clone https://github.com/minor-mn/aion.git
cd aion
bundle install
```

### 4. 環境変数の設定

```bash
cp .env.example .env
```

認証サーバはデフォルトで `https://an.umr.biz` を使います。変える場合は `.env` に `AUTH_SERVER_URL`・`AUTH_BASE_PATH`・`AUTH_ISSUER`・`AUTH_AUDIENCE` を設定し、`public/index.html` の `<meta name="auth-server">` も合わせてください。パスキーは認証サーバが許可したオリジン（`allowed_origins`・`cors_allowed_origins`）でしか使えません。

### 5. データベースの作成とマイグレーション

```bash
bundle exec rails db:create db:migrate
```

### 6. Railsサーバーの起動

```bash
bundle exec rails server -b 0.0.0.0
```

### 7. 管理者を設定

アプリを開き、画面右上の「サインイン」からパスキーで新規登録（またはサインイン）してください。そのあとで、ユーザー名を指定して管理者として設定します。

```bash
bundle exec rails console
```

```ruby
user = User.find_by!(username: "alice") # 認証サーバのユーザー名に置き換える
user.update!(role: :admin)
```

### 8. アクセス確認

以下のURLでアクセスできます：

- **SPA（フロントエンド）**: http://localhost:3000/
- **Swagger UI（APIドキュメント）**: http://localhost:3000/openapi/index.html

### 9. 定期実行（cron）

X からのシフト取り込み、シフト通知、古いレコードの削除は cron から `script/cron_task.sh` を呼んで実行します。同じタスクが前回分の実行中なら、その回はスキップします。ログは `log/cron.log` に出力されます。

設定の雛形は [config/crontab.example](config/crontab.example) にあります。`config/crontab` にコピーし、`RAILS_ROOT` と `PATH` を環境に合わせて書き換えてから、puma を動かしているユーザーで登録してください（`bundle` が見つかる `PATH` が必要です）。`config/crontab` は git 管理外です。

```bash
cp config/crontab.example config/crontab
```

```bash
crontab config/crontab
```

`crontab` コマンドはそのユーザーの既存の crontab を置き換えます。ほかのジョブを登録している場合は `crontab -e` で追記してください。
