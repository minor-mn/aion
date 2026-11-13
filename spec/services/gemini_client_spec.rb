require "rails_helper"

RSpec.describe GeminiClient do
  describe ".configured?" do
    it "returns true only when both GEMINI_MODEL and GEMINI_API_KEY are present" do
      expect(described_class.configured?({ "GEMINI_MODEL" => "gemini-flash-latest", "GEMINI_API_KEY" => "secret" })).to be(true)
      expect(described_class.configured?({ "GEMINI_MODEL" => "gemini-flash-latest", "GEMINI_API_KEY" => "" })).to be(false)
      expect(described_class.configured?({ "GEMINI_MODEL" => "", "GEMINI_API_KEY" => "secret" })).to be(false)
      expect(described_class.configured?({ "GEMINI_MODEL" => "gemini-flash-latest" })).to be(false)
      expect(described_class.configured?({})).to be(false)
    end
  end

  describe "#generate_json" do
    let(:schema) do
      {
        type: "OBJECT",
        properties: {
          ok: { type: "BOOLEAN" }
        },
        required: [ "ok" ]
      }
    end

    it "posts to the Gemini generateContent endpoint and parses JSON ignoring thought parts" do
      captured_request = nil
      http = instance_double(Net::HTTP)
      response = Net::HTTPSuccess.allocate
      allow(response).to receive(:is_a?).with(Net::HTTPSuccess).and_return(true)
      allow(response).to receive(:code).and_return("200")
      allow(response).to receive(:body).and_return(
        {
          candidates: [
            {
              content: {
                parts: [
                  { thought: true, text: "internal reasoning" },
                  { text: '{"ok":true}' }
                ]
              }
            }
          ]
        }.to_json
      )

      expect(Net::HTTP).to receive(:start).with(
        "generativelanguage.googleapis.com",
        443,
        use_ssl: true,
        read_timeout: 60,
        open_timeout: 10
      ).and_yield(http)

      expect(http).to receive(:request) do |req|
        captured_request = req
        response
      end

      client = described_class.new(api_key: "test-gemini-key", model: "gemini-flash-latest")
      result = client.generate_json(prompt: "test prompt", response_schema: schema)

      expect(result).to eq("ok" => true)
      expect(captured_request.path).to eq("/v1beta/models/gemini-flash-latest:generateContent")
      expect(captured_request["x-goog-api-key"]).to eq("test-gemini-key")

      payload = JSON.parse(captured_request.body)
      expect(payload.dig("contents", 0, "parts")).to eq([ { "text" => "test prompt" } ])
      expect(payload.dig("generationConfig", "responseMimeType")).to eq("application/json")
      expect(payload.dig("generationConfig", "responseSchema", "type")).to eq("OBJECT")
    end

    it "downloads image_urls and attaches Base64 inlineData parts" do
      image_http = instance_double(Net::HTTP)
      image_response = Net::HTTPOK.new("1.1", "200", "OK")
      image_response["content-type"] = "image/png"
      allow(image_response).to receive(:body).and_return("PNGDATA")

      gemini_http = instance_double(Net::HTTP)
      gemini_response = Net::HTTPOK.new("1.1", "200", "OK")
      allow(gemini_response).to receive(:body).and_return(
        {
          candidates: [
            {
              content: {
                parts: [ { text: '{"ok":true}' } ]
              }
            }
          ]
        }.to_json
      )

      captured_gemini_request = nil

      expect(Net::HTTP).to receive(:start).with(
        "pbs.twimg.com",
        443,
        use_ssl: true,
        read_timeout: 20,
        open_timeout: 10
      ).and_yield(image_http)
      expect(image_http).to receive(:request).and_return(image_response)

      expect(Net::HTTP).to receive(:start).with(
        "generativelanguage.googleapis.com",
        443,
        use_ssl: true,
        read_timeout: 60,
        open_timeout: 10
      ).and_yield(gemini_http)
      expect(gemini_http).to receive(:request) do |req|
        captured_gemini_request = req
        gemini_response
      end

      client = described_class.new(api_key: "test-gemini-key", model: "gemini-flash-latest")
      result = client.generate_json(
        prompt: "read schedule image",
        response_schema: schema,
        image_urls: [ "https://pbs.twimg.com/media/schedule.png" ]
      )

      expect(result).to eq("ok" => true)
      parts = JSON.parse(captured_gemini_request.body).dig("contents", 0, "parts")
      expect(parts).to eq(
        [
          { "text" => "read schedule image" },
          {
            "inlineData" => {
              "mimeType" => "image/png",
              "data" => Base64.strict_encode64("PNGDATA")
            }
          }
        ]
      )
    end

    it "raises when Gemini returns a non-success HTTP status" do
      http = instance_double(Net::HTTP)
      error_response = Net::HTTPBadRequest.new("1.1", "400", "Bad Request")
      allow(error_response).to receive(:body).and_return('{"error":"invalid argument"}')

      allow(Net::HTTP).to receive(:start).and_yield(http)
      allow(http).to receive(:request).and_return(error_response)

      client = described_class.new(api_key: "test-gemini-key", model: "gemini-flash-latest")
      expect do
        client.generate_json(prompt: "test", response_schema: schema)
      end.to raise_error(RuntimeError, /Gemini request failed: 400/)
    end
  end
end
