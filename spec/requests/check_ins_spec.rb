require "rails_helper"

RSpec.describe "CheckIns", type: :request do
  let!(:shop) { Shop.create!(name: "Test Shop", latitude: 35.681236, longitude: 139.767125) }
  let!(:staff_a) { Staff.create!(name: "Alice", shop_id: shop.id) }

  let!(:user_a) { User.create!(email: "a@example.com", password: "password", confirmed_at: Time.current) }
  let!(:user_b) { User.create!(email: "b@example.com", password: "password", confirmed_at: Time.current) }

  def sign_in(user)
    post "/users/sign_in",
         params: { user: { email: user.email, password: "password" } }.to_json,
         headers: { "Content-Type" => "application/json" }
    { "Authorization" => response.headers["Authorization"], "Content-Type" => "application/json" }
  end

  def create_check_in_for(user, checked_in_at: Time.current - 1.hour, checked_out_at: Time.current)
    user.check_ins.create!(shop: shop, checked_in_at: checked_in_at, checked_out_at: checked_out_at)
  end

  describe "POST /v1/check_ins/:id/staff_rates" do
    context "duplicate same-day ratings" do
      it "1) userA first rating -> StaffRate created; 2) userB first rating -> StaffRate + TotalRate accumulates; 3) userA second same-day -> skipped" do
        # --- 1) User A's first rating ---
        ci_a1 = create_check_in_for(user_a, checked_in_at: Time.current.beginning_of_day + 10.hours, checked_out_at: Time.current.beginning_of_day + 12.hours)
        headers_a = sign_in(user_a)

        expect {
          post "/v1/check_ins/#{ci_a1.id}/staff_rates",
               params: { staff_rates: [ { staff_id: staff_a.id, overall_rate: 3, appearance_rate: 0, service_rate: 0, mood_rate: 0 } ] }.to_json,
               headers: headers_a
          expect(response).to have_http_status(:created)
        }.to change(StaffRate, :count).by(1)

        sr1 = StaffRate.find_by(check_in_id: ci_a1.id, staff_id: staff_a.id)
        expect(sr1).not_to be_nil
        # autofill: only overall=3 given -> all 3
        expect(sr1.overall_rate).to eq(3)
        expect(sr1.appearance_rate).to eq(3)
        expect(sr1.service_rate).to eq(3)
        expect(sr1.mood_rate).to eq(3)

        tr = TotalRate.find_by(staff_id: staff_a.id, year: Time.current.year)
        expect(tr).not_to be_nil
        expect(tr.check_in_count).to eq(1)
        expect(tr.total_overall_rate).to eq(3)
        expect(tr.total_appearance_rate).to eq(3)

        # --- 2) User B's first rating for same staff_a (same day) ---
        ci_b1 = create_check_in_for(user_b, checked_in_at: Time.current.beginning_of_day + 13.hours, checked_out_at: Time.current.beginning_of_day + 15.hours)
        headers_b = sign_in(user_b)

        expect {
          post "/v1/check_ins/#{ci_b1.id}/staff_rates",
               params: { staff_rates: [ { staff_id: staff_a.id, overall_rate: 5, appearance_rate: 4, service_rate: 4, mood_rate: 4 } ] }.to_json,
               headers: headers_b
          expect(response).to have_http_status(:created)
        }.to change(StaffRate, :count).by(1)

        sr2 = StaffRate.find_by(check_in_id: ci_b1.id, staff_id: staff_a.id)
        expect(sr2).not_to be_nil
        expect(sr2.overall_rate).to eq(5)
        expect(sr2.appearance_rate).to eq(4)

        tr.reload
        expect(tr.check_in_count).to eq(2)
        expect(tr.total_overall_rate).to eq(3 + 5)          # 8
        expect(tr.total_appearance_rate).to eq(3 + 4)       # 7
        expect(tr.total_service_rate).to eq(3 + 4)          # 7
        expect(tr.total_mood_rate).to eq(3 + 4)             # 7

        # --- 3) User A's second same-day rating for same staff_a -> skipped ---
        ci_a2 = create_check_in_for(user_a, checked_in_at: Time.current.beginning_of_day + 20.hours, checked_out_at: Time.current.beginning_of_day + 22.hours)
        headers_a2 = sign_in(user_a)

        before_staff_rate_count = StaffRate.count
        before_total = tr.reload.attributes.slice("check_in_count", "total_overall_rate", "total_appearance_rate", "total_service_rate", "total_mood_rate")

        post "/v1/check_ins/#{ci_a2.id}/staff_rates",
             params: { staff_rates: [ { staff_id: staff_a.id, overall_rate: 1, appearance_rate: 1, service_rate: 1, mood_rate: 1 } ] }.to_json,
             headers: headers_a2
        expect(response).to have_http_status(:created)

        body = JSON.parse(response.body)
        expect(body["staff_rates"]).to eq([])
        expect(body["skipped_staff_ids"]).to include(staff_a.id)

        # No new StaffRate
        expect(StaffRate.count).to eq(before_staff_rate_count)
        expect(StaffRate.find_by(check_in_id: ci_a2.id, staff_id: staff_a.id)).to be_nil

        # TotalRate unchanged
        tr.reload
        expect(tr.check_in_count).to eq(before_total["check_in_count"])
        expect(tr.total_overall_rate).to eq(before_total["total_overall_rate"])
        expect(tr.total_appearance_rate).to eq(before_total["total_appearance_rate"])
        expect(tr.total_service_rate).to eq(before_total["total_service_rate"])
        expect(tr.total_mood_rate).to eq(before_total["total_mood_rate"])
      end
    end
  end
end
