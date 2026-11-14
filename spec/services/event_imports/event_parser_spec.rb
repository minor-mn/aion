require "rails_helper"

RSpec.describe EventImports::EventParser do
  describe ".build" do
    it "returns GeminiEventParser with OpenAI fallback when both Gemini and OpenAI key/model are set" do
      parser = described_class.build(
        env: {
          "GEMINI_MODEL" => "gemini-flash-latest",
          "GEMINI_API_KEY" => "gemini-secret",
          "OPENAI_API_KEY" => "openai-secret",
          "OPENAI_MODEL" => "gpt-4.1-mini"
        }
      )

      expect(parser).to be_a(EventImports::GeminiEventParser)
      expect(parser.fallback_parser).to be_a(EventImports::OpenaiEventParser)
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

      expect(parser).to be_a(EventImports::GeminiEventParser)
      expect(parser.fallback_parser).to be_a(EventImports::OpenaiEventParser)
      expect(parser.fallback_parser.model).to eq("o4-mini-2025-04-16")
    end

    it "returns GeminiEventParser without fallback when OpenAI model or key is blank" do
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

      expect(without_model).to be_a(EventImports::GeminiEventParser)
      expect(without_model.fallback_parser).to be_nil
      expect(without_key).to be_a(EventImports::GeminiEventParser)
      expect(without_key.fallback_parser).to be_nil
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

    it "falls back to OpenaiEventParser when Gemini raises an error and fallback_parser is configured" do
      gemini_client = instance_double(GeminiClient)
      fallback_parser = instance_double(EventImports::OpenaiEventParser)
      image_urls = [ "https://example.com/flyer.png" ]
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

      expect(gemini_client).to receive(:generate_json).and_raise(RuntimeError, "Gemini request failed: 429 Too Many Requests")
      expect(fallback_parser).to receive(:parse_page).with(
        url: "https://example.com/events",
        title: "Events",
        text: "11月20日 17時〜23時 Birthday Event",
        image_urls: image_urls
      ).and_return(expected)

      parser = EventImports::GeminiEventParser.new(client: gemini_client, fallback_parser: fallback_parser)
      result = parser.parse_page(
        url: "https://example.com/events",
        title: "Events",
        text: "11月20日 17時〜23時 Birthday Event",
        image_urls: image_urls
      )

      expect(result).to eq(expected)
    end

    it "re-raises Gemini errors when fallback_parser is not configured" do
      gemini_client = instance_double(GeminiClient)

      expect(gemini_client).to receive(:generate_json).and_raise(RuntimeError, "Gemini request failed: 429 Too Many Requests")

      parser = EventImports::GeminiEventParser.new(client: gemini_client)

      expect do
        parser.parse_page(
          url: "https://example.com/events",
          title: "Events",
          text: "11月20日 17時〜23時 Birthday Event"
        )
      end.to raise_error(RuntimeError, /Gemini request failed: 429/)
    end
  end
end
