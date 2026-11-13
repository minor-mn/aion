require "json"

module ShiftImports
  class GeminiShiftParser
    RESPONSE_SCHEMA = {
      type: "OBJECT",
      properties: {
        shop_name: {
          type: "STRING",
          nullable: true
        },
        actions: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              action: {
                type: "STRING",
                enum: %w[add delete change]
              },
              date: {
                type: "STRING"
              },
              start_time: {
                type: "STRING",
                nullable: true
              },
              end_time: {
                type: "STRING",
                nullable: true
              }
            },
            required: %w[action date start_time end_time]
          }
        }
      },
      required: %w[shop_name actions]
    }.freeze

    def initialize(api_key: ENV["GEMINI_API_KEY"], model: ENV["GEMINI_MODEL"], client: nil)
      @client = client || GeminiClient.new(api_key: api_key, model: model)
    end

    def parse_post(text, image_urls: [], posted_at: nil)
      @client.validate_configuration!

      TwitterStreamLogger.info(
        "gemini_request_start model=#{@client.model} length=#{text.to_s.length} image_count=#{image_urls.size}"
      )
      response = @client.request_generate_content(
        prompt: ShiftParser.prompt_for(text, posted_at: posted_at),
        response_schema: RESPONSE_SCHEMA,
        image_urls: image_urls
      )

      TwitterStreamLogger.info("gemini_request_finish status=#{response.code}")
      parsed = @client.parse_json_response(response)
      TwitterStreamLogger.info("gemini_parse_success actions=#{parsed.fetch('actions', []).size}")
      parsed
    rescue JSON::ParserError => e
      TwitterStreamLogger.error("gemini_parse_error #{e.message}")
      raise
    end
  end
end
