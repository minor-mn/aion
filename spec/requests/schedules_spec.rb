# spec/requests/schedules_spec.rb
require "rails_helper"

RSpec.describe "Schedules", type: :request do
  let!(:user) { User.create!(email: "user@example.com", password: "password") }
  let!(:shop) { Shop.create!(name: "Test Shop") }
  let!(:staff1) { Staff.create!(name: "Alice", shop_id: shop.id) }
  let!(:staff2) { Staff.create!(name: "Bob", shop_id: shop.id) }
  let!(:preference1) { StaffPreference.create!(user: user, staff: staff1, score: 3) }
  let!(:preference2) { StaffPreference.create!(user: user, staff: staff2, score: 2) }

  let!(:shift1) do
    StaffShift.create!(
      staff: staff1,
      shop_id: shop.id,
      start_at: Time.zone.parse("2024-05-01 17:00"),
      end_at: Time.zone.parse("2024-05-01 23:00")
    )
  end

  let!(:shift2) do
    StaffShift.create!(
      staff: staff2,
      shop_id: shop.id,
      start_at: Time.zone.parse("2024-05-01 17:00"),
      end_at: Time.zone.parse("2024-05-01 23:00")
    )
  end

  let!(:headers) do
    post "/users/sign_in", params: {
      user: {
        email: user.email,
        password: "password"
      }
    }.to_json, headers: { "Content-Type" => "application/json" }

    token = response.headers["Authorization"]
    { "Authorization" => token }
  end

  describe "GET /v1/schedules" do
    it "returns aggregated staff shifts with scores" do
      get "/v1/schedules", params: {
        datetime_begin: "2024-05-01T00:00:00",
        datetime_end: "2024-05-01T23:59:59"
      }, headers: headers

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["days"].size).to eq(1)
      expect(body["days"].first["total_score"]).to eq(5)
      expect(body["days"].first["staffs"].size).to eq(2)
    end
  end
end
