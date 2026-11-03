require "rails_helper"

RSpec.describe "ActionLogs", type: :request do
  let!(:admin) { create_user(role: "admin") }
  let!(:operator) { create_user(role: "operator") }
  let!(:shop) { Shop.create!(name: "Test Shop") }
  let!(:log_user) { create_user(role: "operator") }
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
    auth_headers_for(admin)
  end

  let(:operator_headers) do
    auth_headers_for(operator)
  end

  it "allows an admin to view action logs" do
    get "/v1/action_logs", headers: admin_headers

    expect(response).to have_http_status(:ok)
    logs = JSON.parse(response.body)["action_logs"]
    expect(logs.size).to eq(1)
    expect(logs.first["user_username"]).to eq(log_user.username)
  end

  it "rejects an operator" do
    get "/v1/action_logs", headers: operator_headers

    expect(response).to have_http_status(:forbidden)
  end
end
