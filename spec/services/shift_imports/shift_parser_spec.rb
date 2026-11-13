require "rails_helper"

RSpec.describe ShiftImports::ShiftParser do
  describe ".build" do
    it "returns GeminiShiftParser when both GEMINI_MODEL and GEMINI_API_KEY are set" do
      parser = described_class.build(
        env: {
          "GEMINI_MODEL" => "gemini-flash-latest",
          "GEMINI_API_KEY" => "gemini-secret",
          "OPENAI_API_KEY" => "openai-secret"
        }
      )

      expect(parser).to be_a(ShiftImports::GeminiShiftParser)
    end

    it "returns OpenaiShiftParser when GEMINI_API_KEY is blank" do
      parser = described_class.build(
        env: {
          "GEMINI_MODEL" => "gemini-flash-latest",
          "GEMINI_API_KEY" => "",
          "OPENAI_API_KEY" => "openai-secret"
        }
      )

      expect(parser).to be_a(ShiftImports::OpenaiShiftParser)
    end

    it "returns OpenaiShiftParser when GEMINI_MODEL is blank" do
      parser = described_class.build(
        env: {
          "GEMINI_MODEL" => "",
          "GEMINI_API_KEY" => "gemini-secret",
          "OPENAI_API_KEY" => "openai-secret"
        }
      )

      expect(parser).to be_a(ShiftImports::OpenaiShiftParser)
    end
  end

  describe "ShiftImports::GeminiShiftParser#parse_post" do
    it "parses shift actions via GeminiClient" do
      gemini_client = instance_double(GeminiClient, model: "gemini-flash-latest")
      response = Net::HTTPOK.new("1.1", "200", "OK")
      expected = {
        "shop_name" => nil,
        "actions" => [
          {
            "action" => "add",
            "date" => "2026-11-14",
            "start_time" => "17:00",
            "end_time" => "22:00"
          }
        ]
      }

      expect(gemini_client).to receive(:validate_configuration!)
      expect(gemini_client).to receive(:request_generate_content).with(
        prompt: a_string_including("明日おつきさま"),
        response_schema: ShiftImports::GeminiShiftParser::RESPONSE_SCHEMA,
        image_urls: []
      ).and_return(response)
      expect(gemini_client).to receive(:parse_json_response).with(response).and_return(expected)

      parser = ShiftImports::GeminiShiftParser.new(client: gemini_client)
      result = parser.parse_post("明日おつきさま", posted_at: Time.zone.parse("2026-11-13 18:00:00"))

      expect(result).to eq(expected)
    end
  end
end
