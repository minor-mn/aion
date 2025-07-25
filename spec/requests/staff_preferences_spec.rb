require "rails_helper"

RSpec.describe "StaffPreferences", type: :request do
  let!(:user) { User.create!(email: "user@example.com", password: "password") }
  let!(:shop) { Shop.create!(name: "Test Shop") }
  let!(:staff) { Staff.create!(name: "Alice", shop_id: shop.id) }

  let!(:headers) do
    post "/users/sign_in",
         params: { user: { email: user.email, password: "password" } }.to_json,
         headers: { "Content-Type" => "application/json" }

    token = response.headers["Authorization"]
    { "Authorization" => token }
  end

  describe "GET /v1/staff_preferences" do
    let!(:preference) { StaffPreference.create!(user: user, staff: staff, score: 7) }

    it "returns staff preferences for current user" do
      get "/v1/staff_preferences", headers: headers
      expect(response).to have_http_status(:ok)
      data = JSON.parse(response.body)["staff_preferences"]
      expect(data).to be_an(Array)
      expect(data.first["score"]).to eq(7)
    end
  end

  describe "POST /v1/staff_preferences" do
    it "creates a staff preference" do
      post "/v1/staff_preferences", params: { staff_id: staff.id, score: 5 }, headers: headers
      expect(response).to have_http_status(:created)
      expect(JSON.parse(response.body)["staff_preference"]["score"]).to eq(5)
    end
  end

  describe "PUT /v1/staff_preferences/:id" do
    let!(:preference) { StaffPreference.create!(user: user, staff: staff, score: 2) }

    it "updates the staff preference" do
      put "/v1/staff_preferences/#{staff.id}", params: { score: 8 }, headers: headers
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["staff_preference"]["score"]).to eq(8)
    end
  end

  describe "DELETE /v1/staff_preferences/:id" do
    let!(:preference) { StaffPreference.create!(user: user, staff: staff, score: 3) }

    it "deletes the staff preference" do
      delete "/v1/staff_preferences/#{staff.id}", headers: headers
      expect(response).to have_http_status(:no_content)
      expect(StaffPreference.find_by(staff_id: staff.id, user_id: user.id)).to be_nil
    end
  end
end
