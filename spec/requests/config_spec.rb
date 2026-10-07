require "rails_helper"

RSpec.describe "Config", type: :request do
  around do |example|
    original_key = ENV["CARTO_API_KEY"]
    ENV["CARTO_API_KEY"] = "test-carto-key"
    example.run
  ensure
    ENV["CARTO_API_KEY"] = original_key
  end

  it "returns the public map configuration" do
    get "/v1/config"

    expect(response).to have_http_status(:ok)
    expect(JSON.parse(response.body)).to include(
      "carto_api_key" => "test-carto-key",
      "checked_in" => nil
    )
    expect(JSON.parse(response.body)["limit_meters"]).to eq(GeoDistance.limit_meters)
  end
end
