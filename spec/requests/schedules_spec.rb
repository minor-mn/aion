# spec/requests/schedules_spec.rb
require "rails_helper"

RSpec.describe "Schedules", type: :request do
  include ActiveSupport::Testing::TimeHelpers

  around do |example|
    travel_to(Time.zone.parse("2024-05-01 17:20")) { example.run }
  end

  let!(:user) { User.create!(email: "user@example.com", password: "password", confirmed_at: Time.current) }
  let!(:shop) { Shop.create!(name: "Test Shop") }
  let!(:staff1) { Staff.create!(name: "Alice", shop_id: shop.id) }
  let!(:staff2) { Staff.create!(name: "Bob", shop_id: shop.id) }
  let!(:staff3) { Staff.create!(name: "Carol", shop_id: shop.id) }
  let!(:preference1) { StaffPreference.create!(user: user, staff: staff1, score: 3) }
  let!(:preference2) { StaffPreference.create!(user: user, staff: staff2, score: 2) }
  let!(:preference3) { StaffPreference.create!(user: user, staff: staff3, score: 0) }

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
  let!(:shift3) do
    StaffShift.create!(
      staff: staff3,
      shop_id: shop.id,
      start_at: Time.zone.parse("2024-05-01 18:00"),
      end_at: Time.zone.parse("2024-05-01 22:00")
    )
  end
  let!(:multi_day_event) do
    Event.create!(
      shop: shop,
      title: "Long Event",
      start_at: Time.zone.parse("2024-05-01 17:00"),
      end_at: Time.zone.parse("2024-05-03 23:00")
    )
  end
  let!(:seat_availability) do
    SeatAvailability.create!(
      shop: shop,
      staff: staff1,
      staff_shift: shift1,
      source_post_id: "100",
      source_post_url: "https://x.com/i/web/status/100",
      source_posted_at: Time.zone.parse("2024-05-01 17:10"),
      detected_keyword: "💺",
      raw_text: "おせきあります 💺"
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
        datetime_end: "2024-05-03T23:59:59"
      }, headers: headers

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["days"].size).to eq(3)
      expect(body["days"].first["total_score"]).to eq(5)
      expect(body["days"].first["staffs"].size).to eq(2)
      expect(body["days"].first["staffs"].map { |staff| staff["name"] }).to eq([ "Alice", "Bob" ])
      expect(body["days"].first["staffs"].find { |staff| staff["name"] == "Alice" }["seat_score"]).to eq(5)
      expect(body["days"].first["staffs"].find { |staff| staff["name"] == "Bob" }["seat_score"]).to eq(0)
      expect(body["days"].map { |day| day["date"] }).to eq([ "2024-05-01", "2024-05-02", "2024-05-03" ])
      expect(body["days"].map { |day| day["events"].map { |event| event["id"] } }).to eq([ [ multi_day_event.id ], [ multi_day_event.id ], [ multi_day_event.id ] ])
    end
  end
end
