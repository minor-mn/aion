require "rails_helper"

RSpec.describe "User authentication", type: :request do
  let(:headers) do
    { "Content-Type" => "application/json", "Accept" => "application/json", "User-Agent" => AUTH_USER_AGENT }
  end

  def token_headers(sub, **claims)
    token = AUTH_ISSUER.token(sub: sub, headers: { "User-Agent" => AUTH_USER_AGENT }, **claims)
    headers.merge("Authorization" => "Bearer #{token}")
  end

  # 初回のリクエストで、認証サーバのユーザーに紐付くユーザーを作る
  it "creates a user on the first request with a token" do
    expect {
      get "/v1/user/me", headers: token_headers("sub-1", preferred_username: "alice", name: "Alice")
    }.to change(User, :count).by(1)

    expect(response).to have_http_status(:ok)
    json = JSON.parse(response.body)["user"]
    user = User.find_by!(auth_sub: "sub-1")
    expect(json).to eq("id" => user.id, "username" => "alice", "nickname" => "Alice", "role" => "user")
  end

  # 2回目以降は同じユーザー。ニックネームは認証サーバの値に合わせる
  it "reuses the user and follows the nickname" do
    user = create_user(sub: "sub-1", username: "alice", nickname: "Alice", role: "operator")

    expect {
      get "/v1/user/me", headers: token_headers("sub-1", preferred_username: "alice", name: "Alice 2")
    }.not_to change(User, :count)

    json = JSON.parse(response.body)["user"]
    expect(json["id"]).to eq(user.id)
    expect(json["nickname"]).to eq("Alice 2")
    expect(json["role"]).to eq("operator")
  end

  it "rejects a request without a token" do
    get "/v1/user/me", headers: headers

    expect(response).to have_http_status(:unauthorized)
    expect(JSON.parse(response.body)["error"]).to eq("Authentication failed")
  end

  it "rejects a token for another audience" do
    get "/v1/user/me", headers: token_headers("sub-1", aud: "p2p")

    expect(response).to have_http_status(:unauthorized)
  end

  it "rejects an expired token" do
    get "/v1/user/me", headers: token_headers("sub-1", ttl: -3600)

    expect(response).to have_http_status(:unauthorized)
  end

  it "rejects a token used from another device" do
    get "/v1/user/me", headers: token_headers("sub-1").merge("User-Agent" => "other")

    expect(response).to have_http_status(:unauthorized)
    expect(User.find_by(auth_sub: "sub-1")).to be_nil
  end
end
