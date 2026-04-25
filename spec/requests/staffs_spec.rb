require "rails_helper"

RSpec.describe "Staffs", type: :request do
  let!(:user) { User.create!(email: "staff@example.com", password: "password", role: "operator", confirmed_at: Time.current) }
  let!(:basic_user) { User.create!(email: "viewer@example.com", password: "password", role: "user", confirmed_at: Time.current) }
  let!(:other_user) { User.create!(email: "other@example.com", password: "password", role: "user", confirmed_at: Time.current) }
  let!(:shop) { Shop.create!(name: "Test Shop") }
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

  describe "GET /v1/staffs" do
    it "returns a list of staffs" do
      Staff.create!(name: "Test Staff", shop_id: shop.id)
      get "/v1/staffs", params: { shop_id: shop.id }
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)).to have_key("staffs")
    end
  end

  describe "POST /v1/staffs" do
    it "creates a new staff" do
      post "/v1/staffs", params: { name: "New Staff", shop_id: shop.id }, headers: basic_auth_headers
      expect(response).to have_http_status(:created)
      expect(JSON.parse(response.body)["name"]).to eq("New Staff")
    end
  end

  describe "GET /v1/staffs/:id" do
    let!(:staff) { Staff.create!(name: "Existing Staff", shop_id: shop.id) }

    it "shows a staff" do
      get "/v1/staffs/#{staff.id}", params: { shop_id: shop.id }
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["name"]).to eq("Existing Staff")
      expect(JSON.parse(response.body)["staff_preference_score"]).to be_nil
    end

    it "returns current user's staff preference score when signed in" do
      StaffPreference.create!(user: basic_user, staff: staff, score: 4)

      get "/v1/staffs/#{staff.id}", params: { shop_id: shop.id }, headers: basic_auth_headers
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["staff_preference_score"]).to eq(4)
    end
  end

  describe "GET /v1/staffs/:id/recent_posts" do
    let!(:staff) { Staff.create!(name: "Recent Staff", shop_id: shop.id) }
    let!(:other_staff) { Staff.create!(name: "Other Staff", shop_id: shop.id) }

    before do
      ShiftImportCandidate.create!(
        staff: staff,
        shop: shop,
        action: "skip",
        start_at: Time.zone.parse("2026-04-01 17:00"),
        end_at: Time.zone.parse("2026-04-01 23:00"),
        source_post_id: "100",
        source_post_url: "https://x.com/i/web/status/100",
        source_posted_at: Time.zone.parse("2026-04-01 10:00"),
        source_username: "staff_recent",
        raw_text: "一番古い"
      )
      ShiftImportCandidate.create!(
        staff: staff,
        shop: shop,
        action: "skip",
        start_at: Time.zone.parse("2026-04-02 17:00"),
        end_at: Time.zone.parse("2026-04-02 23:00"),
        source_post_id: "200",
        source_post_url: "https://x.com/i/web/status/200",
        source_posted_at: Time.zone.parse("2026-04-02 10:00"),
        source_username: "staff_recent",
        raw_text: "二番目"
      )
      ShiftImportCandidate.create!(
        staff: staff,
        shop: shop,
        action: "skip",
        start_at: Time.zone.parse("2026-04-03 17:00"),
        end_at: Time.zone.parse("2026-04-03 23:00"),
        source_post_id: "300",
        source_post_url: "https://x.com/i/web/status/300",
        source_posted_at: Time.zone.parse("2026-04-03 10:00"),
        source_username: "staff_recent",
        raw_text: "三番目"
      )
      ShiftImportCandidate.create!(
        staff: staff,
        shop: shop,
        action: "skip",
        start_at: Time.zone.parse("2026-04-04 17:00"),
        end_at: Time.zone.parse("2026-04-04 23:00"),
        source_post_id: "400",
        source_post_url: "https://x.com/i/web/status/400",
        source_posted_at: Time.zone.parse("2026-04-04 10:00"),
        source_username: "staff_recent",
        raw_text: "最新"
      )
      ShiftImportCandidate.create!(
        staff: staff,
        shop: shop,
        action: "add",
        start_at: Time.zone.parse("2026-04-04 18:00"),
        end_at: Time.zone.parse("2026-04-04 23:00"),
        source_post_id: "400",
        source_post_url: "https://x.com/i/web/status/400",
        source_posted_at: Time.zone.parse("2026-04-04 10:00"),
        source_username: "staff_recent",
        raw_text: "最新（重複）"
      )
      ShiftImportCandidate.create!(
        staff: other_staff,
        shop: shop,
        action: "skip",
        start_at: Time.zone.parse("2026-04-05 17:00"),
        end_at: Time.zone.parse("2026-04-05 23:00"),
        source_post_id: "900",
        source_post_url: "https://x.com/i/web/status/900",
        source_posted_at: Time.zone.parse("2026-04-05 10:00"),
        source_username: "other_staff",
        raw_text: "別キャスト"
      )
    end

    it "returns distinct posts by source_post_id ordered by id desc" do
      get "/v1/staffs/#{staff.id}/recent_posts", params: { limit: 3 }

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["recent_posts"].size).to eq(3)
      expect(body["recent_posts"].map { |post| post["source_post_id"] }).to eq(%w[400 300 200])
      expect(body["recent_posts"].first["raw_text"]).to eq("最新（重複）")
    end
  end

  describe "PATCH /v1/staffs/:id" do
    let!(:staff) { Staff.create!(name: "Old Staff", shop_id: shop.id, user: basic_user) }

    it "updates a staff for the owner" do
      patch "/v1/staffs/#{staff.id}", params: { name: "Updated Staff", shop_id: shop.id }, headers: basic_auth_headers
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["name"]).to eq("Updated Staff")
    end

    it "updates a staff for an operator" do
      patch "/v1/staffs/#{staff.id}", params: { name: "Updated Staff", shop_id: shop.id }, headers: auth_headers
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)["name"]).to eq("Updated Staff")
    end

    it "rejects a different basic user" do
      patch "/v1/staffs/#{staff.id}", params: { name: "Updated Staff", shop_id: shop.id }, headers: other_auth_headers
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "DELETE /v1/staffs/:id" do
    let!(:staff) { Staff.create!(name: "To Be Deleted", shop_id: shop.id, user: basic_user) }

    it "deletes a staff for the owner" do
      delete "/v1/staffs/#{staff.id}", params: { shop_id: shop.id }, headers: basic_auth_headers
      expect(response).to have_http_status(:no_content)
    end

    it "deletes a staff for an operator" do
      delete "/v1/staffs/#{staff.id}", params: { shop_id: shop.id }, headers: auth_headers
      expect(response).to have_http_status(:no_content)
    end

    it "rejects a different basic user" do
      delete "/v1/staffs/#{staff.id}", params: { shop_id: shop.id }, headers: other_auth_headers
      expect(response).to have_http_status(:forbidden)
    end
  end
end
