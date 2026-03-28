require "rails_helper"

RSpec.describe "Events", type: :request do
  let!(:operator) { User.create!(email: "operator@example.com", password: "password", role: "operator", confirmed_at: Time.current) }
  let!(:basic_user) { User.create!(email: "basic@example.com", password: "password", role: "user", confirmed_at: Time.current) }
  let!(:other_user) { User.create!(email: "other@example.com", password: "password", role: "user", confirmed_at: Time.current) }
  let!(:shop) { Shop.create!(name: "Event Shop") }

  let(:operator_headers) { { "Authorization" => "Bearer #{Warden::JWTAuth::UserEncoder.new.call(operator, :user, nil).first}" } }
  let(:basic_headers) { { "Authorization" => "Bearer #{Warden::JWTAuth::UserEncoder.new.call(basic_user, :user, nil).first}" } }
  let(:other_headers) { { "Authorization" => "Bearer #{Warden::JWTAuth::UserEncoder.new.call(other_user, :user, nil).first}" } }

  describe "GET /v1/events" do
    let!(:future_event) { Event.create!(shop: shop, title: "Future", start_at: 1.day.from_now, end_at: 2.days.from_now) }
    let!(:current_event) { Event.create!(shop: shop, title: "Current", start_at: 1.hour.ago, end_at: 1.hour.from_now) }
    let!(:past_event) { Event.create!(shop: shop, title: "Past", start_at: 2.days.ago, end_at: 1.day.ago) }

    it "returns only current and future events when future_only is enabled" do
      get "/v1/events", params: { future_only: 1 }

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["events"].map { |event| event["title"] }).to eq([ "Current", "Future" ])
    end

    it "supports p and s params" do
      12.times do |i|
        Event.create!(shop: shop, title: "Event #{i}", start_at: (i + 3).days.from_now, end_at: (i + 3).days.from_now + 1.hour)
      end

      get "/v1/events", params: { future_only: 1, p: 2, s: 5 }

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["events"].length).to eq(5)
    end
  end

  describe "POST /v1/events" do
    it "creates an event for a basic user" do
      post "/v1/events", headers: basic_headers, params: {
        event: {
          shop_id: shop.id,
          title: "Special Event",
          start_at: Time.current,
          end_at: 1.hour.from_now
        }
      }

      expect(response).to have_http_status(:created)
    end

    it "rejects an event without start_at and end_at" do
      post "/v1/events", headers: basic_headers, params: {
        event: {
          shop_id: shop.id,
          title: "Special Event"
        }
      }

      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "rejects an event that spans 32 days or more" do
      post "/v1/events", headers: basic_headers, params: {
        event: {
          shop_id: shop.id,
          title: "Long Event",
          start_at: Time.zone.parse("2026-03-01 00:00"),
          end_at: Time.zone.parse("2026-04-02 00:00")
        }
      }

      expect(response).to have_http_status(:unprocessable_entity)
    end
  end

  describe "PATCH /v1/events/:id" do
    let!(:event) { Event.create!(shop: shop, user: basic_user, title: "Old", start_at: Time.current, end_at: 1.hour.from_now) }

    it "allows the owner" do
      patch "/v1/events/#{event.id}", headers: basic_headers, params: { event: { title: "New" } }

      expect(response).to have_http_status(:ok)
    end

    it "allows an operator" do
      patch "/v1/events/#{event.id}", headers: operator_headers, params: { event: { title: "New" } }

      expect(response).to have_http_status(:ok)
    end

    it "rejects a different basic user" do
      patch "/v1/events/#{event.id}", headers: other_headers, params: { event: { title: "New" } }

      expect(response).to have_http_status(:forbidden)
    end

    it "rejects an update that spans 32 days or more" do
      patch "/v1/events/#{event.id}", headers: basic_headers, params: {
        event: {
          start_at: Time.zone.parse("2026-03-01 00:00"),
          end_at: Time.zone.parse("2026-04-02 00:00")
        }
      }

      expect(response).to have_http_status(:unprocessable_entity)
    end
  end
end
