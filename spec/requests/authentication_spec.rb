require "rails_helper"

RSpec.describe "User authentication", type: :request do
  let(:user_params) do
    {
      user: {
        email: "test@example.com",
        password: "password",
        password_confirmation: "password"
      }
    }
  end

  let(:headers) do
    { "Content-Type" => "application/json" }
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

    post "/users/sign_in", params: { user: { email: "test@example.com", password: "password" } }.to_json, headers: headers

    expect(response).to have_http_status(:ok)
    token = response.headers["Authorization"]
    expect(token).to start_with("Bearer ")
  end

  # ユーザ情報
  it "fetches current user info with valid token" do
    user = User.create!(email: "test@example.com", password: "password", password_confirmation: "password")

    post "/users/sign_in", params: { user: { email: user.email, password: "password" } }.to_json, headers: headers
    token = response.headers["Authorization"]

    get "/user/me", headers: headers.merge("Authorization" => token)
    expect(response).to have_http_status(:ok)

    json = JSON.parse(response.body)
    pp json
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

  # 削除
  it "deletes a user" do
    user = User.create!(email: "test@example.com", password: "password", password_confirmation: "password")

    post "/users/sign_in", params: { user: { email: user.email, password: "password" } }.to_json, headers: headers
    token = response.headers["Authorization"]

    delete "/users", headers: headers.merge("Authorization" => token)
    expect(response).to have_http_status(:no_content)
  end
end

