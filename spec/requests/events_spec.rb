require "rails_helper"

RSpec.describe "Events", type: :request do
  let!(:operator) { User.create!(email: "operator@example.com", password: "password", role: "operator", confirmed_at: Time.current) }
  let!(:basic_user) { User.create!(email: "basic@example.com", password: "password", role: "user", confirmed_at: Time.current) }
  let!(:other_user) { User.create!(email: "other@example.com", password: "password", role: "user", confirmed_at: Time.current) }
  let!(:shop) { Shop.create!(name: "Event Shop") }

  let(:operator_headers) { { "Authorization" => "Bearer #{Warden::JWTAuth::UserEncoder.new.call(operator, :user, nil).first}" } }
  let(:basic_headers) { { "Authorization" => "Bearer #{Warden::JWTAuth::UserEncoder.new.call(basic_user, :user, nil).first}" } }
  let(:other_headers) { { "Authorization" => "Bearer #{Warden::JWTAuth::UserEncoder.new.call(other_user, :user, nil).first}" } }

  describe "POST /v1/events" do
    it "creates an event for a basic user" do
      post "/v1/events", headers: basic_headers, params: {
        shop_id: shop.id,
        title: "Special Event",
        start_at: Time.current,
        end_at: 1.hour.from_now
      }

      expect(response).to have_http_status(:created)
    end
  end

  describe "PATCH /v1/events/:id" do
    let!(:event) { Event.create!(shop: shop, user: basic_user, title: "Old", start_at: Time.current, end_at: 1.hour.from_now) }

    it "allows the owner" do
      patch "/v1/events/#{event.id}", headers: basic_headers, params: { title: "New" }

      expect(response).to have_http_status(:ok)
    end

    it "allows an operator" do
      patch "/v1/events/#{event.id}", headers: operator_headers, params: { title: "New" }

      expect(response).to have_http_status(:ok)
    end

    it "rejects a different basic user" do
      patch "/v1/events/#{event.id}", headers: other_headers, params: { title: "New" }

      expect(response).to have_http_status(:forbidden)
    end
  end
end
