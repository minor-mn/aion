require "rails_helper"

RSpec.describe "Users", type: :request do
  let!(:admin) { create_user(role: "admin") }
  let!(:operator) { create_user(role: "operator") }
  let!(:basic_user) { create_user(role: "user") }
  let!(:extra_users) do
    12.times.map do |i|
      create_user(role: "user")
    end
  end

  let(:json_headers) { { "Content-Type" => "application/json", "Accept" => "application/json" } }

  let(:admin_headers) do
    auth_headers_for(admin)
  end

  let(:operator_headers) do
    auth_headers_for(operator)
  end

  let(:user_headers) do
    auth_headers_for(basic_user)
  end

  describe "GET /v1/users" do
    it "allows an admin" do
      get "/v1/users", headers: admin_headers

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["users"]).to be_an(Array)
      expect(body["users"].length).to eq(10)
      expect(body["users"].first["id"]).to eq(extra_users.last.id)
      expect(body["users"].first.keys).to contain_exactly("id", "username", "nickname", "role", "created_at", "updated_at")
    end

    it "supports p and s params" do
      get "/v1/users?p=2&s=5", headers: admin_headers

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["users"].length).to eq(5)
      expect(body["users"].first["id"]).to eq(extra_users[6].id)
    end

    it "rejects an operator" do
      get "/v1/users", headers: operator_headers

      expect(response).to have_http_status(:forbidden)
    end

    it "rejects a basic user" do
      get "/v1/users", headers: user_headers

      expect(response).to have_http_status(:forbidden)
    end

    it "rejects an unauthenticated request" do
      get "/v1/users", headers: json_headers

      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "PATCH /v1/users/:id" do
    it "allows an admin to update the role" do
      patch "/v1/users/#{basic_user.id}",
        params: { role: "operator" }.to_json,
        headers: admin_headers.merge(json_headers)

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["user"]["role"]).to eq("operator")
    end

    # ニックネームは認証サーバが正なので、ここでは変えない
    it "ignores nickname" do
      patch "/v1/users/#{basic_user.id}",
        params: { nickname: "Updated User", role: "operator" }.to_json,
        headers: admin_headers.merge(json_headers)

      expect(response).to have_http_status(:ok)
      expect(basic_user.reload.nickname).to be_nil
    end

    it "rejects an operator" do
      patch "/v1/users/#{basic_user.id}",
        params: { nickname: "Updated User", role: "operator" }.to_json,
        headers: operator_headers.merge(json_headers)

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "DELETE /v1/users/:id" do
    let!(:other_admin) { create_user(role: "admin") }

    it "allows an admin to delete another user" do
      delete "/v1/users/#{basic_user.id}", headers: admin_headers

      expect(response).to have_http_status(:no_content)
      expect(User.find_by(id: basic_user.id)).to be_nil
    end

    it "rejects deleting self" do
      delete "/v1/users/#{admin.id}", headers: admin_headers

      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "rejects deleting the last admin" do
      other_admin.destroy!

      delete "/v1/users/#{admin.id}", headers: admin_headers

      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "rejects an operator" do
      delete "/v1/users/#{basic_user.id}", headers: operator_headers

      expect(response).to have_http_status(:forbidden)
    end
  end
end
