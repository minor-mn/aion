require "rails_helper"

RSpec.describe ShiftImports::ShiftParser do
  describe ".build" do
    it "returns GeminiShiftParser with OpenAI fallback when both Gemini and OpenAI key/model are set" do
      parser = described_class.build(
        env: {
          "GEMINI_MODEL" => "gemini-flash-latest",
          "GEMINI_API_KEY" => "gemini-secret",
          "OPENAI_API_KEY" => "openai-secret",
          "OPENAI_MODEL" => "gpt-4.1-mini"
        }
      )

      expect(parser).to be_a(ShiftImports::GeminiShiftParser)
      expect(parser.fallback_parser).to be_a(ShiftImports::OpenaiShiftParser)
      expect(parser.fallback_parser.model).to eq("gpt-4.1-mini")
    end

    it "also accepts OPENAI_API_MODEL for OpenAI fallback configuration" do
      parser = described_class.build(
        env: {
          "GEMINI_MODEL" => "gemini-flash-latest",
          "GEMINI_API_KEY" => "gemini-secret",
          "OPENAI_API_KEY" => "openai-secret",
          "OPENAI_API_MODEL" => "o4-mini-2025-04-16"
        }
      )

      expect(parser).to be_a(ShiftImports::GeminiShiftParser)
      expect(parser.fallback_parser).to be_a(ShiftImports::OpenaiShiftParser)
      expect(parser.fallback_parser.model).to eq("o4-mini-2025-04-16")
    end

    it "returns GeminiShiftParser without fallback when OpenAI model or key is blank" do
      without_model = described_class.build(
        env: {
          "GEMINI_MODEL" => "gemini-flash-latest",
          "GEMINI_API_KEY" => "gemini-secret",
          "OPENAI_API_KEY" => "openai-secret"
        }
      )
      without_key = described_class.build(
        env: {
          "GEMINI_MODEL" => "gemini-flash-latest",
          "GEMINI_API_KEY" => "gemini-secret",
          "OPENAI_MODEL" => "gpt-4.1-mini"
        }
      )

      expect(without_model).to be_a(ShiftImports::GeminiShiftParser)
      expect(without_model.fallback_parser).to be_nil
      expect(without_key).to be_a(ShiftImports::GeminiShiftParser)
      expect(without_key.fallback_parser).to be_nil
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

    it "falls back to OpenaiShiftParser when Gemini raises an error and fallback_parser is configured" do
      gemini_client = instance_double(GeminiClient, model: "gemini-flash-latest")
      fallback_parser = instance_double(ShiftImports::OpenaiShiftParser)
      posted_at = Time.zone.parse("2026-11-13 18:00:00")
      image_urls = [ "https://pbs.twimg.com/media/sample.jpg" ]
      expected = {
        "shop_name" => "Test Shop",
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
      expect(gemini_client).to receive(:request_generate_content).and_raise(RuntimeError, "Gemini request failed: 503 Service Unavailable")
      expect(fallback_parser).to receive(:parse_post).with(
        "明日おつきさま",
        image_urls: image_urls,
        posted_at: posted_at
      ).and_return(expected)

      parser = ShiftImports::GeminiShiftParser.new(client: gemini_client, fallback_parser: fallback_parser)
      result = parser.parse_post("明日おつきさま", image_urls: image_urls, posted_at: posted_at)

      expect(result).to eq(expected)
    end

    it "re-raises Gemini errors when fallback_parser is not configured" do
      gemini_client = instance_double(GeminiClient, model: "gemini-flash-latest")

      expect(gemini_client).to receive(:validate_configuration!)
      expect(gemini_client).to receive(:request_generate_content).and_raise(RuntimeError, "Gemini request failed: 503 Service Unavailable")

      parser = ShiftImports::GeminiShiftParser.new(client: gemini_client)

      expect do
        parser.parse_post("明日おつきさま")
      end.to raise_error(RuntimeError, /Gemini request failed: 503/)
    end
  end
end
