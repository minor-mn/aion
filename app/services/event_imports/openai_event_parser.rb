require "json"
require "net/http"

module EventImports
  class OpenaiEventParser
    API_BASE = "https://api.openai.com/v1".freeze
    DEFAULT_MODEL = "gpt-4.1-mini".freeze
    MODEL = ENV.fetch("OPENAI_MODEL", DEFAULT_MODEL)

    def initialize(api_key: ENV["OPENAI_API_KEY"], model: ENV["OPENAI_MODEL"].presence || DEFAULT_MODEL)
      @api_key = api_key
      @model = model
    end

    def parse_page(url:, title:, text:, image_urls: [])
      raise "OPENAI_API_KEY is not configured" if @api_key.blank?

      uri = URI("#{API_BASE}/chat/completions")
      request = Net::HTTP::Post.new(uri)
      request["Content-Type"] = "application/json"
      request["Authorization"] = "Bearer #{@api_key}"
      request.body = JSON.generate(
        model: @model,
        messages: [
          {
            role: "user",
            content: build_content(url: url, title: title, text: text, image_urls: image_urls)
          }
        ],
        response_format: response_format_schema
      )

      response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, read_timeout: 60, open_timeout: 10) do |http|
        http.request(request)
      end

      raise "OpenAI request failed: #{response.code} #{response.body}" unless response.is_a?(Net::HTTPSuccess)

      body = JSON.parse(response.body)
      JSON.parse(body.dig("choices", 0, "message", "content").to_s)
    end

    private

    def build_content(url:, title:, text:, image_urls:)
      content = [
        {
          type: "text",
          text: build_prompt(url: url, title: title, text: text)
        }
      ]

      image_urls.each do |image_url|
        content << {
          type: "image_url",
          image_url: {
            url: image_url,
            detail: "high"
          }
        }
      end

      content
    end

    def response_format_schema
      {
        type: "json_schema",
        json_schema: {
          name: "event_entries",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              events: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    title: { type: "string" },
                    url: {
                      anyOf: [
                        { type: "string" },
                        { type: "null" }
                      ]
                    },
                    start_at: { type: "string" },
                    end_at: { type: "string" }
                  },
                  required: %w[title url start_at end_at]
                }
              }
            },
            required: %w[events]
          }
        }
      }
    end

    def build_prompt(url:, title:, text:)
      EventParser.build_prompt(url: url, title: title, text: text)
    end
  end
end
