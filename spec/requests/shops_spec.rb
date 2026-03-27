require "rails_helper"

RSpec.describe "Shops", type: :request do
  let!(:user) { User.create!(email: "test@example.com", password: "password", role: "operator", confirmed_at: Time.current) }
  let!(:basic_user) { User.create!(email: "basic@example.com", password: "password", role: "user", confirmed_at: Time.current) }
  let!(:other_user) { User.create!(email: "other@example.com", password: "password", role: "user", confirmed_at: Time.current) }
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

  describe "GET /v1/shops" do
    it "returns a list of shops" do
      Shop.create!(name: "Test Shop")
      get "/v1/shops"
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)).to have_key("shops")
    end
  end

  describe "POST /v1/shops" do
    it "creates a new shop" do
      post "/v1/shops", params: { name: "New Shop" }, headers: basic_auth_headers
      expect(response).to have_http_status(:created)
      expect(JSON.parse(response.body)["name"]).to eq("New Shop")
    end
  end

  describe "GET /v1/shops/:id" do
    let!(:shop) { Shop.create!(name: "Target Shop") }

    it "shows a shop" do
      get "/v1/shops/#{shop.id}"
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["name"]).to eq("Target Shop")
    end
  end

  describe "GET /v1/shops/:id/monthly_shifts" do
    let!(:shop) { Shop.create!(name: "Target Shop") }
    let!(:staff1) { Staff.create!(name: "Alice", shop: shop) }
    let!(:staff2) { Staff.create!(name: "Bob", shop: shop) }
    let!(:shift1) do
      StaffShift.create!(
        staff: staff1,
        shop_id: shop.id,
        start_at: Time.zone.parse("2026-03-15 17:00"),
        end_at: Time.zone.parse("2026-03-15 23:00")
      )
    end
    let!(:shift2) do
      StaffShift.create!(
        staff: staff2,
        shop_id: shop.id,
        start_at: Time.zone.parse("2026-03-15 12:00"),
        end_at: Time.zone.parse("2026-03-16 05:00")
      )
    end
    let!(:event) do
      Event.create!(
        shop: shop,
        title: "Spring Event",
        url: "https://example.com/events/spring",
        start_at: Time.zone.parse("2026-03-20 18:00"),
        end_at: Time.zone.parse("2026-03-20 23:00")
      )
    end

    it "returns the aggregated daily range for the month" do
      get "/v1/shops/#{shop.id}/monthly_shifts", params: { year: 2026, month: 3 }

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["days"]).to eq([
        {
          "date" => "2026-03-15",
          "start_at" => "2026-03-15T12:00:00.000+09:00",
          "end_at" => "2026-03-16T05:00:00.000+09:00",
          "label" => "12:00\n05:00"
        }
      ])
      expect(body["events"]).to eq([
        {
          "id" => event.id,
          "user_id" => nil,
          "title" => "Spring Event",
          "url" => "https://example.com/events/spring",
          "start_at" => "2026-03-20T18:00:00.000+09:00",
          "end_at" => "2026-03-20T23:00:00.000+09:00"
        }
      ])
    end
  end

  describe "PATCH /v1/shops/:id" do
    let!(:shop) { Shop.create!(name: "Old Name", user: basic_user) }

    it "updates a shop for the owner" do
      patch "/v1/shops/#{shop.id}", params: { name: "Updated Name" }, headers: basic_auth_headers
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["name"]).to eq("Updated Name")
    end

    it "updates a shop for an operator" do
      patch "/v1/shops/#{shop.id}", params: { name: "Updated Name" }, headers: auth_headers
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["name"]).to eq("Updated Name")
    end

    it "rejects a different basic user" do
      patch "/v1/shops/#{shop.id}", params: { name: "Updated Name" }, headers: other_auth_headers
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "DELETE /v1/shops/:id" do
    let!(:shop) { Shop.create!(name: "To Be Deleted", user: basic_user) }

    it "deletes a shop for the owner" do
      delete "/v1/shops/#{shop.id}", headers: basic_auth_headers
      expect(response).to have_http_status(:no_content)
    end

    it "deletes a shop for an operator" do
      delete "/v1/shops/#{shop.id}", headers: auth_headers
      expect(response).to have_http_status(:no_content)
    end

    it "rejects a different basic user" do
      delete "/v1/shops/#{shop.id}", headers: other_auth_headers
      expect(response).to have_http_status(:forbidden)
    end
  end
end
