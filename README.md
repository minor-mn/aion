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

### 6. Access the API documentation

Open your browser and go to:

```
http://localhost:3000/openapi/index.html
```

You can now explore and test the API endpoints using Swagger UI.

