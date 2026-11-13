require "rails_helper"

RSpec.describe EventImports::EventParser do
  describe ".build" do
    it "returns GeminiEventParser when both GEMINI_MODEL and GEMINI_API_KEY are set" do
      parser = described_class.build(
        env: {
          "GEMINI_MODEL" => "gemini-flash-latest",
          "GEMINI_API_KEY" => "gemini-secret",
          "OPENAI_API_KEY" => "openai-secret"
        }
      )

      expect(parser).to be_a(EventImports::GeminiEventParser)
    end

    it "returns OpenaiEventParser when GEMINI_API_KEY is blank" do
      parser = described_class.build(
        env: {
          "GEMINI_MODEL" => "gemini-flash-latest",
          "GEMINI_API_KEY" => "",
          "OPENAI_API_KEY" => "openai-secret"
        }
      )

      expect(parser).to be_a(EventImports::OpenaiEventParser)
    end

    it "returns OpenaiEventParser when GEMINI_MODEL is blank" do
      parser = described_class.build(
        env: {
          "GEMINI_MODEL" => "",
          "GEMINI_API_KEY" => "gemini-secret",
          "OPENAI_API_KEY" => "openai-secret"
        }
      )

      expect(parser).to be_a(EventImports::OpenaiEventParser)
    end
  end

  describe "EventImports::GeminiEventParser#parse_page" do
    it "parses event entries via GeminiClient" do
      gemini_client = instance_double(GeminiClient)
      expected = {
        "events" => [
          {
            "title" => "Birthday Event",
            "url" => nil,
            "start_at" => "2026-11-20T17:00:00+09:00",
            "end_at" => "2026-11-20T23:00:00+09:00"
          }
        ]
      }

      expect(gemini_client).to receive(:generate_json).with(
        prompt: a_string_including("https://example.com/events"),
        response_schema: EventImports::GeminiEventParser::RESPONSE_SCHEMA,
        image_urls: []
      ).and_return(expected)

      parser = EventImports::GeminiEventParser.new(client: gemini_client)
      result = parser.parse_page(
        url: "https://example.com/events",
        title: "Events",
        text: "11月20日 17時〜23時 Birthday Event"
      )

      expect(result).to eq(expected)
    end
  end
end
