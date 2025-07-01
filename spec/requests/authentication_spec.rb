require "rails_helper"

RSpec.describe "User authentication", type: :request do
  let(:user_params) do
    {
      email: "test@example.com",
      password: "password",
      password_confirmation: "password"
    }
  end

  let(:headers) do
    { "Content-Type" => "application/json", "Accept" => "application/json" }
  end

  # ユーザ作成
  it "registers a user" do
    post "/users", params: user_params.to_json, headers: headers

    expect(response).to have_http_status(:ok)
    expect(JSON.parse(response.body)["message"]).to eq("Registered.")
  end

  # ログイン
  it "logs in and returns a JWT" do
    User.create!(email: "test@example.com", password: "password", password_confirmation: "password")

    post "/users/sign_in", params: { user: { email: "test@example.com", password: "password" } }, headers: headers, as: :json

    expect(response).to have_http_status(:ok)
    token = response.headers["Authorization"]
    expect(token).to start_with("Bearer ")
  end

  # ログイン失敗
  it "fails to log in with incorrect credentials" do
    User.create!(email: "test@example.com", password: "password", password_confirmation: "password")

    post "/users/sign_in", params: { user: { email: "test@example.com", password: "wrongpassword" } }.to_json, headers: headers

    expect(response).to have_http_status(:unauthorized)
    json = JSON.parse(response.body)
    expect(json["error"]).to eq("Authentication failed")
  end

  # ユーザ情報
  it "fetches current user info with valid token" do
    user = User.create!(email: "test@example.com", password: "password", password_confirmation: "password")

    post "/users/sign_in", params: { user: { email: user.email, password: "password" } }.to_json, headers: headers
    token = response.headers["Authorization"]

    get "/v1/user/me", headers: headers.merge("Authorization" => token)
    expect(response).to have_http_status(:ok)

    json = JSON.parse(response.body)
    expect(json["user"]["email"]).to eq(user.email)
  end

  # ログアウト
  it "logs out a user by revoking the token" do
    user = User.create!(email: "test@example.com", password: "password", password_confirmation: "password")

    post "/users/sign_in", params: { user: { email: user.email, password: "password" } }.to_json, headers: headers
    token = response.headers["Authorization"]

    delete "/users/sign_out", headers: headers.merge("Authorization" => token)
    expect(response).to have_http_status(:ok)
  end

  # 更新
  it "updates user email and password" do
    user = User.create!(email: "test@example.com", password: "password", password_confirmation: "password")

    # ログインしてトークン取得
    post "/users/sign_in", params: { user: { email: user.email, password: "password" } }.to_json, headers: headers
    token = response.headers["Authorization"]

    # ユーザー情報を更新
    patch "/users",
      params: {
        email: "updated@example.com",
        password: "newpassword",
        password_confirmation: "newpassword",
        current_password: "password"
      }.to_json,
      headers: headers.merge("Authorization" => token)

    expect(response).to have_http_status(:ok)
    json = JSON.parse(response.body)
    expect(json["message"]).to eq("Updated.")
    expect(json["user"]["email"]).to eq("updated@example.com")
  end

  # 削除
  it "deletes a user" do
    user = User.create!(email: "test@example.com", password: "password", password_confirmation: "password")

    post "/users/sign_in", params: { user: { email: user.email, password: "password" } }.to_json, headers: headers
    token = response.headers["Authorization"]

    delete "/users", headers: headers.merge("Authorization" => token)
    expect(response).to have_http_status(:no_content)
  end
end
