require "rails_helper"

RSpec.describe "Shops", type: :request do
  let!(:user) { User.create!(email: "test@example.com", password: "password") }
  let(:auth_headers) do
    post "/users/sign_in", params: {
      user: { email: user.email, password: "password" }
    }.to_json, headers: { "Content-Type" => "application/json" }

    { "Authorization" => response.headers["Authorization"] }
  end

  describe "GET /shops" do
    it "returns a list of shops" do
      Shop.create!(name: "Test Shop")
      get "/shops"
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)).to have_key("shops")
    end
  end

  describe "POST /shops" do
    it "creates a new shop" do
      post "/shops", params: { shop: { name: "New Shop" } }, headers: auth_headers
      expect(response).to have_http_status(:created)
      expect(JSON.parse(response.body)["name"]).to eq("New Shop")
    end
  end

  describe "GET /shops/:id" do
    let!(:shop) { Shop.create!(name: "Target Shop") }

    it "shows a shop" do
      get "/shops/#{shop.id}"
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["name"]).to eq("Target Shop")
    end
  end

  describe "PATCH /shops/:id" do
    let!(:shop) { Shop.create!(name: "Old Name") }

    it "updates a shop" do
      patch "/shops/#{shop.id}", params: { shop: { name: "Updated Name" } }, headers: auth_headers
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["name"]).to eq("Updated Name")
    end
  end

  describe "DELETE /shops/:id" do
    let!(:shop) { Shop.create!(name: "To Be Deleted") }

    it "deletes a shop" do
      delete "/shops/#{shop.id}", headers: auth_headers
      expect(response).to have_http_status(:no_content)
    end
  end
end
