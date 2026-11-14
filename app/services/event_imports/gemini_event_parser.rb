module EventImports
  class GeminiEventParser
    RESPONSE_SCHEMA = {
      type: "OBJECT",
      properties: {
        events: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING" },
              url: {
                type: "STRING",
                nullable: true
              },
              start_at: { type: "STRING" },
              end_at: { type: "STRING" }
            },
            required: %w[title url start_at end_at]
          }
        }
      },
      required: %w[events]
    }.freeze

    attr_reader :fallback_parser

    def initialize(api_key: ENV["GEMINI_API_KEY"], model: ENV["GEMINI_MODEL"], client: nil, fallback_parser: nil)
      @client = client || GeminiClient.new(api_key: api_key, model: model)
      @fallback_parser = fallback_parser
    end

    def parse_page(url:, title:, text:, image_urls: [])
      parsed = @client.generate_json(
        prompt: EventParser.build_prompt(url: url, title: title, text: text),
        response_schema: RESPONSE_SCHEMA,
        image_urls: image_urls
      )
      raise "Gemini returned non-object JSON: #{parsed.class}" unless parsed.is_a?(Hash)

      parsed
    rescue StandardError => e
      raise unless @fallback_parser

      Rails.logger.warn("[EventImports] Gemini failed (#{e.class}: #{e.message}), falling back to OpenAI")
      @fallback_parser.parse_page(url: url, title: title, text: text, image_urls: image_urls)
    end
  end
end
