require "rails_helper"

RSpec.describe "ShiftImportCandidates API", type: :request do
  let!(:operator) { User.create!(email: "operator@example.com", password: "password", role: "operator", confirmed_at: Time.current) }
  let!(:basic_user) { User.create!(email: "user@example.com", password: "password", role: "user", confirmed_at: Time.current) }
  let!(:shop) { Shop.create!(name: "Test Shop") }
  let!(:staff) { Staff.create!(name: "Alice", shop: shop) }
  let!(:candidate) do
    ShiftImportCandidate.create!(
      shop: shop,
      staff: staff,
      action: "add",
      parsed_shop_name: "Test Shop",
      parsed_staff_name: "Alice",
      start_at: Time.zone.parse("2026-04-01 17:00"),
      end_at: Time.zone.parse("2026-04-01 23:00"),
      source_post_id: "123",
      source_post_url: "https://x.com/i/web/status/123",
      raw_text: "4/1 17-23"
    )
  end

  let(:operator_headers) { { "Authorization" => "Bearer #{Warden::JWTAuth::UserEncoder.new.call(operator, :user, nil).first}" } }
  let(:basic_headers) { { "Authorization" => "Bearer #{Warden::JWTAuth::UserEncoder.new.call(basic_user, :user, nil).first}" } }

  describe "GET /v1/shift_import_candidates" do
    it "allows an operator" do
      get "/v1/shift_import_candidates", headers: operator_headers

      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["shift_import_candidates"].size).to eq(1)
    end

    it "rejects a basic user" do
      get "/v1/shift_import_candidates", headers: basic_headers
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "POST /v1/shift_import_candidates/import_from_x" do
    it "allows an operator" do
      importer = instance_double(ShiftImports::ImportFromXList, call: { "imported_count" => 2 })
      allow(ShiftImports::ImportFromXList).to receive(:new).and_return(importer)

      post "/v1/shift_import_candidates/import_from_x", headers: operator_headers

      expect(response).to have_http_status(:ok)
    end
  end

  describe "PATCH /v1/shift_import_candidates/:id/approve" do
    it "creates a staff shift and removes the candidate" do
      expect {
        patch "/v1/shift_import_candidates/#{candidate.id}/approve", headers: operator_headers
      }.to change(StaffShift, :count).by(1).and change(ShiftImportCandidate, :count).by(-1)

      expect(response).to have_http_status(:ok)
    end

    it "deletes same-day shifts for delete action" do
      StaffShift.create!(shop: shop, staff: staff, start_at: Time.zone.parse("2026-04-01 18:00"), end_at: Time.zone.parse("2026-04-01 23:00"))
      candidate.update!(action: "delete", end_at: nil, start_at: Time.zone.parse("2026-04-01 00:00"))

      expect {
        patch "/v1/shift_import_candidates/#{candidate.id}/approve", headers: operator_headers
      }.to change(StaffShift, :count).by(-1)
    end

    it "ignores change action when same-day shifts do not exist" do
      candidate.update!(action: "change")

      patch "/v1/shift_import_candidates/#{candidate.id}/approve", headers: operator_headers

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["applied"]).to eq(false)
    end
  end

  describe "DELETE /v1/shift_import_candidates/:id" do
    it "deletes the candidate" do
      expect {
        delete "/v1/shift_import_candidates/#{candidate.id}", headers: operator_headers
      }.to change(ShiftImportCandidate, :count).by(-1)

      expect(response).to have_http_status(:no_content)
    end
  end
end
