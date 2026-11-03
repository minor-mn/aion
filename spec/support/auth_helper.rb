require "umbra/testing"

# 認証サーバの代わりにテスト用の鍵でトークンを発行し、Rails.configuration.x.auth を通信しないようにする。
AUTH_ISSUER = Umbra::Testing::Issuer.new(issuer: "https://an.umr.biz", audience: "umr")
AUTH_ISSUER.attach(Rails.configuration.x.auth)
AUTH_USER_AGENT = "rspec".freeze

module AuthHelper
  def create_user(role: "user", sub: SecureRandom.uuid, username: "user-#{SecureRandom.hex(4)}", nickname: nil)
    User.create!(auth_sub: sub, username: username, nickname: nickname, role: role)
  end

  def auth_token_for(user, **claims)
    AUTH_ISSUER.token(
      sub: user.auth_sub,
      headers: { "User-Agent" => AUTH_USER_AGENT },
      preferred_username: user.username,
      name: user.nickname,
      **claims
    )
  end

  def auth_headers_for(user, **claims)
    { "Authorization" => "Bearer #{auth_token_for(user, **claims)}", "User-Agent" => AUTH_USER_AGENT }
  end
end

RSpec.configure do |config|
  config.include AuthHelper
end
