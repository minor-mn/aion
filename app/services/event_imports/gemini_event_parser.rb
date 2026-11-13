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

    def initialize(api_key: ENV["GEMINI_API_KEY"], model: ENV["GEMINI_MODEL"], client: nil)
      @client = client || GeminiClient.new(api_key: api_key, model: model)
    end

    def parse_page(url:, title:, text:, image_urls: [])
      @client.generate_json(
        prompt: EventParser.build_prompt(url: url, title: title, text: text),
        response_schema: RESPONSE_SCHEMA,
        image_urls: image_urls
      )
    end
  end
end
