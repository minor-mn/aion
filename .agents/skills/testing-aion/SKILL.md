# Testing Aion (Rails API + Vue.js SPA)

## Local Development Setup

1. Ensure PostgreSQL 14+ is running: `sudo systemctl start postgresql`
2. Install dependencies: `bundle install` (from repo root)
3. Create and migrate DB: `bundle exec rails db:create db:migrate`
4. Start Rails server: `bundle exec rails server -b 0.0.0.0 -p 3000`
5. Access SPA at `http://localhost:3000`

## Environment Variables

Copy `.env.example` to `.env`. Key variables:
- `DEVISE_JWT_SECRET_KEY` - Required for JWT auth (generate with `rails secret`)
- `DB_USERNAME` - PostgreSQL username (defaults to `aion`)
- SMTP/POP settings only needed for actual email delivery testing

## Email Confirmation Flow Testing

Since development environment doesn't send real emails, extract the confirmation token directly from the database:

```bash
bundle exec rails runner "puts User.find_by(email: 'EMAIL').confirmation_token"
```

Then visit: `http://localhost:3000/users/confirmation?confirmation_token=TOKEN`

### Key Test Scenarios

1. **Registration**: POST to register -> green alert with confirmation message -> redirects to login view
2. **Confirmation success**: Visit confirmation URL with valid token -> green alert "メールアドレスが確認されました。ログインしてください。"
3. **Confirmation error (reused token)**: Visit same URL again -> red alert with Japanese Devise error (not raw JSON or 500)
4. **Login after confirmation**: Enter credentials -> calendar view with current month, today highlighted
5. **Duplicate email registration**: Register with already-confirmed email -> red error "Eメール はすでに使用されています"

## SPA Navigation

- **Unauthenticated**: Shows "本日の出勤" (today's attendance) section only
- **Login**: Click "ログイン" button (top-right)
- **Registration**: From login page, click "新規登録" link
- **After login**: Calendar view with month navigation (« 前月 / 翌月 »)
- **Hamburger menu** (☰, top-right when logged in): "店舗管理" (shop management), "キャスト管理" (cast management)

## Common Issues

- **Japanese text input via automation**: The `type` action in browser automation may not handle Japanese characters correctly. Use ASCII text for test data names (e.g., "Test Shop A" instead of "テスト店舗").
- **i18n translation keys**: If you see "Translation missing: ja.activerecord.errors..." in error messages, check `config/locales/devise.ja.yml` for missing ActiveRecord validation translations.
- **URL encoding**: Japanese characters in redirect URLs must be encoded with `URI.encode_www_form_component` to avoid `UnsafeRedirectError`.
- **Chrome password manager dialog**: May appear during login/registration testing. Dismiss with OK or by clicking elsewhere.

## Cleaning Test Data

```bash
bundle exec rails runner "User.find_by(email: 'test@example.com')&.destroy"
```

## Devin Secrets Needed

No secrets required for local development testing. The JWT secret is auto-generated.
For production/SMTP testing: SMTP_ADDRESS, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, POP_ADDRESS, POP_USERNAME, POP_PASSWORD.
