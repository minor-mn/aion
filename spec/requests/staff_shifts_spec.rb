require "rails_helper"

RSpec.describe "StaffShifts API", type: :request do
  let!(:user) { create_user(role: "operator") }
  let!(:basic_user) { create_user(role: "user") }
  let!(:other_user) { create_user(role: "user") }
  let!(:shop) { Shop.create(name: "Test Shop") }
  let!(:staff) { Staff.create(name: "Test Staff", shop_id: shop.id) }
  let(:headers) { auth_headers_for(user) }
  let(:basic_headers) { auth_headers_for(basic_user) }
  let(:other_headers) { auth_headers_for(other_user) }

  describe "GET /v1/shops/:shop_id/staff_shifts" do
    before { StaffShift.create!(shop_id: shop.id, staff_id: staff.id, start_at: Time.current, end_at: 1.hour.from_now) }

    it "returns all staff shifts for the shop" do
      get "/v1/shops/#{shop.id}/staff_shifts", headers: headers
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)).to have_key("staff_shifts")
    end
  end

  describe "POST /v1/shops/:shop_id/staff_shifts" do
    it "creates a new staff shift" do
      post "/v1/shops/#{shop.id}/staff_shifts", headers: basic_headers, params: {
        staff_id: staff.id,
        start_at: Time.current,
        end_at: 2.hours.from_now
      }
      expect(response).to have_http_status(:created)
    end
  end

  describe "POST /v1/shops/:shop_id/staff_shifts/bulk_create" do
    it "allows an operator to create multiple shifts" do
      post "/v1/shops/#{shop.id}/staff_shifts/bulk_create", headers: headers, params: {
        staff_id: staff.id,
        shifts: [
          { start_at: Time.zone.parse("2026-04-01 17:00"), end_at: Time.zone.parse("2026-04-01 23:00") },
          { start_at: Time.zone.parse("2026-04-02 17:00"), end_at: Time.zone.parse("2026-04-02 23:00") }
        ]
      }

      expect(response).to have_http_status(:created)
      body = JSON.parse(response.body)
      expect(body["staff_shifts"].size).to eq(2)
    end

    it "rejects a basic user" do
      post "/v1/shops/#{shop.id}/staff_shifts/bulk_create", headers: basic_headers, params: {
        staff_id: staff.id,
        shifts: [
          { start_at: Time.zone.parse("2026-04-01 17:00"), end_at: Time.zone.parse("2026-04-01 23:00") }
        ]
      }

      expect(response).to have_http_status(:forbidden)
    end

    it "rolls back all shifts when one row is invalid" do
      post "/v1/shops/#{shop.id}/staff_shifts/bulk_create", headers: headers, params: {
        staff_id: staff.id,
        shifts: [
          { start_at: Time.zone.parse("2026-04-01 17:00"), end_at: Time.zone.parse("2026-04-01 23:00") },
          { start_at: Time.zone.parse("2026-04-01 22:00"), end_at: Time.zone.parse("2026-04-02 01:00") }
        ]
      }

      expect(response).to have_http_status(:unprocessable_entity)
      expect(StaffShift.count).to eq(0)
    end
  end

  describe "PATCH /v1/shops/:shop_id/staff_shifts/:id" do
    let!(:shift) { StaffShift.create!(shop_id: shop.id, staff_id: staff.id, start_at: Time.current, end_at: 1.hour.from_now, user: basic_user) }

    it "updates the staff shift for the owner" do
      patch "/v1/shops/#{shop.id}/staff_shifts/#{shift.id}", headers: basic_headers, params: {
        end_at: 3.hours.from_now
      }
      expect(response).to have_http_status(:ok)
    end

    it "updates the staff shift for an operator" do
      patch "/v1/shops/#{shop.id}/staff_shifts/#{shift.id}", headers: headers, params: {
        end_at: 3.hours.from_now
      }
      expect(response).to have_http_status(:ok)
    end

    it "rejects a different basic user" do
      patch "/v1/shops/#{shop.id}/staff_shifts/#{shift.id}", headers: other_headers, params: {
        end_at: 3.hours.from_now
      }
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "DELETE /v1/shops/:shop_id/staff_shifts/:id" do
    let!(:shift) { StaffShift.create!(shop_id: shop.id, staff_id: staff.id, start_at: Time.current, end_at: 1.hour.from_now, user: basic_user) }

    it "deletes the staff shift for the owner" do
      delete "/v1/shops/#{shop.id}/staff_shifts/#{shift.id}", headers: basic_headers
      expect(response).to have_http_status(:no_content)
    end

    it "deletes the staff shift for an operator" do
      delete "/v1/shops/#{shop.id}/staff_shifts/#{shift.id}", headers: headers
      expect(response).to have_http_status(:no_content)
    end

    it "rejects a different basic user" do
      delete "/v1/shops/#{shop.id}/staff_shifts/#{shift.id}", headers: other_headers
      expect(response).to have_http_status(:forbidden)
    end
  end
end
