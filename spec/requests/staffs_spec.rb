require "rails_helper"

RSpec.describe "Staffs", type: :request do
  let!(:user) { User.create!(email: "staff@example.com", password: "password", role: "operator", confirmed_at: Time.current) }
  let!(:basic_user) { User.create!(email: "viewer@example.com", password: "password", role: "user", confirmed_at: Time.current) }
  let!(:other_user) { User.create!(email: "other@example.com", password: "password", role: "user", confirmed_at: Time.current) }
  let!(:shop) { Shop.create!(name: "Test Shop") }
  let(:auth_headers) do
    post "/users/sign_in", params: {
      user: { email: user.email, password: "password" }
    }.to_json, headers: { "Content-Type" => "application/json" }

    { "Authorization" => response.headers["Authorization"] }
  end
  let(:basic_auth_headers) do
    post "/users/sign_in", params: {
      user: { email: basic_user.email, password: "password" }
    }.to_json, headers: { "Content-Type" => "application/json" }

    { "Authorization" => response.headers["Authorization"] }
  end
  let(:other_auth_headers) do
    post "/users/sign_in", params: {
      user: { email: other_user.email, password: "password" }
    }.to_json, headers: { "Content-Type" => "application/json" }

    { "Authorization" => response.headers["Authorization"] }
  end

  describe "GET /v1/staffs" do
    it "returns a list of staffs" do
      Staff.create!(name: "Test Staff", shop_id: shop.id)
      get "/v1/staffs", params: { shop_id: shop.id }
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)).to have_key("staffs")
    end
  end

  describe "POST /v1/staffs" do
    it "creates a new staff" do
      post "/v1/staffs", params: { name: "New Staff", shop_id: shop.id }, headers: basic_auth_headers
      expect(response).to have_http_status(:created)
      expect(JSON.parse(response.body)["name"]).to eq("New Staff")
    end
  end

  describe "GET /v1/staffs/:id" do
    let!(:staff) { Staff.create!(name: "Existing Staff", shop_id: shop.id) }

    it "shows a staff" do
      get "/v1/staffs/#{staff.id}", params: { shop_id: shop.id }
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["name"]).to eq("Existing Staff")
    end
  end

  describe "PATCH /v1/staffs/:id" do
    let!(:staff) { Staff.create!(name: "Old Staff", shop_id: shop.id, user: basic_user) }

    it "updates a staff for the owner" do
      patch "/v1/staffs/#{staff.id}", params: { name: "Updated Staff", shop_id: shop.id }, headers: basic_auth_headers
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["name"]).to eq("Updated Staff")
    end

    it "updates a staff for an operator" do
      patch "/v1/staffs/#{staff.id}", params: { name: "Updated Staff", shop_id: shop.id }, headers: auth_headers
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["name"]).to eq("Updated Staff")
    end

    it "rejects a different basic user" do
      patch "/v1/staffs/#{staff.id}", params: { name: "Updated Staff", shop_id: shop.id }, headers: other_auth_headers
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "DELETE /v1/staffs/:id" do
    let!(:staff) { Staff.create!(name: "To Be Deleted", shop_id: shop.id, user: basic_user) }

    it "deletes a staff for the owner" do
      delete "/v1/staffs/#{staff.id}", params: { shop_id: shop.id }, headers: basic_auth_headers
      expect(response).to have_http_status(:no_content)
    end

    it "deletes a staff for an operator" do
      delete "/v1/staffs/#{staff.id}", params: { shop_id: shop.id }, headers: auth_headers
      expect(response).to have_http_status(:no_content)
    end

    it "rejects a different basic user" do
      delete "/v1/staffs/#{staff.id}", params: { shop_id: shop.id }, headers: other_auth_headers
      expect(response).to have_http_status(:forbidden)
    end
  end
end
