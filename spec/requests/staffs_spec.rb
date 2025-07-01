require "rails_helper"

RSpec.describe "Staffs", type: :request do
  let!(:user) { User.create!(email: "staff@example.com", password: "password") }
  let!(:shop) { Shop.create!(name: "Test Shop") }
  let(:auth_headers) do
    post "/users/sign_in", params: {
      user: { email: user.email, password: "password" }
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
      post "/v1/staffs", params: { name: "New Staff", shop_id: shop.id }, headers: auth_headers
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
    let!(:staff) { Staff.create!(name: "Old Staff", shop_id: shop.id) }

    it "updates a staff" do
      patch "/v1/staffs/#{staff.id}", params: { name: "Updated Staff", shop_id: shop.id }, headers: auth_headers
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["name"]).to eq("Updated Staff")
    end
  end

  describe "DELETE /v1/staffs/:id" do
    let!(:staff) { Staff.create!(name: "To Be Deleted", shop_id: shop.id) }

    it "deletes a staff" do
      delete "/v1/staffs/#{staff.id}", params: { shop_id: shop.id }, headers: auth_headers
      expect(response).to have_http_status(:no_content)
    end
  end
end
