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

    attr_reader :fallback_parser

    def initialize(api_key: ENV["GEMINI_API_KEY"], model: ENV["GEMINI_MODEL"], client: nil, fallback_parser: nil)
      @client = client || GeminiClient.new(api_key: api_key, model: model)
      @fallback_parser = fallback_parser
    end

    def parse_post(text, image_urls: [], posted_at: nil)
      parse_with_gemini(text, image_urls: image_urls, posted_at: posted_at)
    rescue StandardError => e
      raise unless @fallback_parser

      TwitterStreamLogger.warn("gemini_fallback_to_openai error=#{e.class}: #{e.message}")
      @fallback_parser.parse_post(text, image_urls: image_urls, posted_at: posted_at)
    end

    private

    def parse_with_gemini(text, image_urls:, posted_at:)
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
      raise "Gemini returned non-object JSON: #{parsed.class}" unless parsed.is_a?(Hash)

      TwitterStreamLogger.info("gemini_parse_success actions=#{parsed.fetch('actions', []).size}")
      parsed
    rescue JSON::ParserError => e
      TwitterStreamLogger.error("gemini_parse_error #{e.message}")
      raise
    end
  end
end
