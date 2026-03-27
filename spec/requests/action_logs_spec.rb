require "rails_helper"

RSpec.describe "ActionLogs", type: :request do
  let!(:admin) { User.create!(email: "admin@example.com", password: "password", role: "admin", confirmed_at: Time.current) }
  let!(:operator) { User.create!(email: "operator@example.com", password: "password", role: "operator", confirmed_at: Time.current) }
  let!(:shop) { Shop.create!(name: "Test Shop") }
  let!(:log_user) { User.create!(email: "actor@example.com", password: "password", role: "operator", confirmed_at: Time.current) }
  let!(:action_log) do
    ActionLog.create!(
      user_id: log_user.id,
      action_type: "update",
      target_type: "Shop",
      target_id: shop.id,
      shop_id: shop.id,
      detail: { name: shop.name }
    )
  end

  let(:json_headers) { { "Content-Type" => "application/json" } }

  let(:admin_headers) do
    post "/users/sign_in", params: { user: { email: admin.email, password: "password" } }.to_json, headers: json_headers
    { "Authorization" => response.headers["Authorization"] }
  end

  let(:operator_headers) do
    post "/users/sign_in", params: { user: { email: operator.email, password: "password" } }.to_json, headers: json_headers
    { "Authorization" => response.headers["Authorization"] }
  end

  it "allows an admin to view action logs" do
    get "/v1/action_logs", headers: admin_headers

    expect(response).to have_http_status(:ok)
    expect(JSON.parse(response.body)["action_logs"].size).to eq(1)
  end

  it "rejects an operator" do
    get "/v1/action_logs", headers: operator_headers

    expect(response).to have_http_status(:forbidden)
  end
end
