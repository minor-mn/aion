require "rails_helper"

RSpec.describe "StaffPreferences", type: :request do
  let!(:user) { User.create!(email: "user@example.com", password: "password") }
  let!(:shop) { Shop.create!(name: "Test Shop") }
  let!(:staff) { Staff.create!(name: "Alice", shop_id: shop.id) }
  let!(:headers) do
    post "/users/sign_in", params: { user: { email: user.email, password: "password" } }.to_json,
                           headers: { "Content-Type" => "application/json" }
    token = response.headers["Authorization"]
    { "Authorization" => token }
  end

  describe "POST /v1/staff_preferences" do
    it "creates a staff preference" do
      post "/v1/staff_preferences", params: { staff_preference: { staff_id: staff.id, score: 5 } }, headers: headers
      expect(response).to have_http_status(:created)
      expect(JSON.parse(response.body)["staff_preference"]["score"]).to eq(5)
    end
  end

  describe "GET /v1/staff_preferences" do
    before do
      StaffPreference.create!(user_id: user.id, staff_id: staff.id, score: 8)
      StaffShift.create!(
        staff: staff,
        shop_id: shop.id,
        start_at: Date.new(2025, 7, 10, 10),
        end_at: Date.new(2025, 7, 10, 18)
      )
    end

    it "returns current month's shifts by default" do
      get "/v1/staff_preferences", headers: headers
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)).to have_key("staff_shifts")
    end

    it "returns shifts for valid date" do
      get "/v1/staff_preferences", params: { date: "2025-07-01" }, headers: headers
      expect(response).to have_http_status(:ok)
      json = JSON.parse(response.body)
      expect(json).to have_key("staff_shifts")
      expect(json["staff_shifts"].size).to be > 0
    end

    it "returns error for invalid date format" do
      get "/v1/staff_preferences", params: { date: "invalid-date" }, headers: headers
      expect(response).to have_http_status(:bad_request)
      expect(JSON.parse(response.body)["error"]).to eq("Invalid date format")
    end
  end
end
