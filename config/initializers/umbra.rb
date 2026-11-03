# Passkey authentication by crystal-p2p-server. Tokens are verified locally against its JWKS.
Rails.application.config.x.auth = Umbra::Client.new(
  server_url: ENV.fetch("AUTH_SERVER_URL", "https://an.umr.biz"),
  base_path: ENV.fetch("AUTH_BASE_PATH", "/auth"),
  issuer: ENV.fetch("AUTH_ISSUER", "https://an.umr.biz"),
  audience: ENV.fetch("AUTH_AUDIENCE", "umr")
)
