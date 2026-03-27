# Aion API

This is a Ruby on Rails API application with JWT authentication and Swagger UI documentation.

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

Create a `.env` file in the project root with the following content:

```env
DEVISE_JWT_SECRET_KEY=<your_secret_key>
```

### 4. Set up the database

```bash
bundle exec rails db:create db:migrate
```

### 5. Start the Rails server

```bash
bundle exec rails server -b 0.0.0.0
```

### 6. 管理者を設定

アプリを開き、画面右上の「サインイン」を押します。表示された画面の「新規登録」から、管理者にしたいメールアドレスでアカウントを作成してください。確認メールに記載されたリンクを開いて登録を完了したあとで、同じメールアドレスを指定して管理者として設定します。

```bash
bundle exec rails console
```

```ruby
user = User.find_by!(email: "admin@example.com") # 登録に使ったメールアドレスに置き換える
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

`.env` を編集し、最低限 `DEVISE_JWT_SECRET_KEY` を設定します：

```bash
# JWTシークレットキーを生成して設定
echo "DEVISE_JWT_SECRET_KEY=$(bundle exec rails secret)" >> .env
```

メール送信が必要な場合は、SMTPの設定も `.env` に記述してください（`.env.example` を参照）。

開発環境でメールの動作確認をするには [MailHog](https://github.com/mailhog/MailHog) が便利です：

```bash
# MailHogのインストール（Go製のSMTPテストサーバー）
sudo apt install -y golang-go
go install github.com/mailhog/MailHog@latest

# MailHogの起動（SMTP: localhost:1025, Web UI: localhost:8025）
~/go/bin/MailHog &
```

### 5. データベースの作成とマイグレーション

```bash
bundle exec rails db:create db:migrate
```

### 6. Railsサーバーの起動

```bash
bundle exec rails server -b 0.0.0.0
```

### 7. 管理者を設定

アプリを開き、画面右上の「サインイン」を押します。表示された画面の「新規登録」から、管理者にしたいメールアドレスでアカウントを作成してください。確認メールに記載されたリンクを開いて登録を完了したあとで、同じメールアドレスを指定して管理者として設定します。

```bash
bundle exec rails console
```

```ruby
user = User.find_by!(email: "admin@example.com") # 登録に使ったメールアドレスに置き換える
user.update!(role: :admin)
```

### 8. アクセス確認

以下のURLでアクセスできます：

- **SPA（フロントエンド）**: http://localhost:3000/
- **Swagger UI（APIドキュメント）**: http://localhost:3000/openapi/index.html
