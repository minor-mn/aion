require "rails_helper"

RSpec.describe "StaffShifts API", type: :request do
  let!(:user) { User.create(email: "test@example.com", password: "password") }
  let!(:shop) { Shop.create(name: "Test Shop") }
  let!(:staff) { Staff.create(name: "Test Staff", shop_id: shop.id) }
  let(:headers) { { "Authorization" => "Bearer #{Warden::JWTAuth::UserEncoder.new.call(user, :user, nil).first}" } }

  describe "GET /shops/:shop_id/staff_shifts" do
    before { StaffShift.create!(shop_id: shop.id, staff_id: staff.id, start_at: Time.current, end_at: 1.hour.from_now) }

    it "returns all staff shifts for the shop" do
      get "/v1/shops/#{shop.id}/staff_shifts"
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)).to have_key("staff_shifts")
    end
  end

  describe "POST /v1/shops/:shop_id/staff_shifts" do
    it "creates a new staff shift" do
      post "/v1/shops/#{shop.id}/staff_shifts", headers: headers, params: {
        staff_shift: {
          staff_id: staff.id,
          start_at: Time.current,
          end_at: 2.hours.from_now
        }
      }
      expect(response).to have_http_status(:created)
    end
  end

  describe "PATCH /v1/shops/:shop_id/staff_shifts/:id" do
    let!(:shift) { StaffShift.create!(shop_id: shop.id, staff_id: staff.id, start_at: Time.current, end_at: 1.hour.from_now) }

    it "updates the staff shift" do
      patch "/v1/shops/#{shop.id}/staff_shifts/#{shift.id}", headers: headers, params: {
        staff_shift: { end_at: 3.hours.from_now }
      }
      expect(response).to have_http_status(:ok)
    end
  end

  describe "DELETE /v1/shops/:shop_id/staff_shifts/:id" do
    let!(:shift) { StaffShift.create!(shop_id: shop.id, staff_id: staff.id, start_at: Time.current, end_at: 1.hour.from_now) }

    it "deletes the staff shift" do
      delete "/v1/shops/#{shop.id}/staff_shifts/#{shift.id}", headers: headers
      expect(response).to have_http_status(:no_content)
    end
  end
end
