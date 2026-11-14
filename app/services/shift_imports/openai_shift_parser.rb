require "net/http"
require "json"

module ShiftImports
  class OpenaiShiftParser
    API_BASE = "https://api.openai.com/v1".freeze
    DEFAULT_MODEL = "gpt-4.1-mini".freeze

    attr_reader :model

    def self.model_from(env = ENV)
      env["OPENAI_MODEL"].to_s.strip.presence || env["OPENAI_API_MODEL"].to_s.strip.presence
    end

    def self.configured?(env = ENV)
      env["OPENAI_API_KEY"].present? && model_from(env).present?
    end

    MODEL = model_from(ENV) || DEFAULT_MODEL

    def initialize(api_key: ENV["OPENAI_API_KEY"], model: self.class.model_from(ENV) || DEFAULT_MODEL)
      @api_key = api_key.to_s.strip
      @model = model.to_s.strip.presence || DEFAULT_MODEL
    end

    def parse_post(text, image_urls: [], posted_at: nil)
      raise "OPENAI_API_KEY is not configured" if @api_key.blank?

      TwitterStreamLogger.info("openai_request_start model=#{@model} length=#{text.to_s.length} image_count=#{image_urls.size}")
      uri = URI("#{API_BASE}/chat/completions")
      request = Net::HTTP::Post.new(uri)
      request["Content-Type"] = "application/json"
      request["Authorization"] = "Bearer #{@api_key}"
      request.body = JSON.generate(
        model: @model,
        messages: [
          {
            role: "user",
            content: build_content(text, image_urls, posted_at: posted_at)
          }
        ],
        response_format: response_format_schema
      )

      response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, read_timeout: 60, open_timeout: 10) do |http|
        http.request(request)
      end

      TwitterStreamLogger.info("openai_request_finish status=#{response.code}")
      raise "OpenAI request failed: #{response.code} #{response.body}" unless response.is_a?(Net::HTTPSuccess)

      body = JSON.parse(response.body)
      text_response = body.dig("choices", 0, "message", "content").to_s
      parsed = JSON.parse(text_response)
      TwitterStreamLogger.info("openai_parse_success actions=#{parsed.fetch('actions', []).size}")
      parsed
    rescue JSON::ParserError => e
      TwitterStreamLogger.error("openai_parse_error #{e.message}")
      raise
    end

    private

    def build_content(text, image_urls, posted_at:)
      content = [
        {
          type: "text",
          text: prompt_for(text, posted_at: posted_at)
        }
      ]

      image_urls.each do |url|
        content << {
          type: "image_url",
          image_url: {
            url: url,
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
          name: "shift_actions",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              shop_name: {
                anyOf: [
                  { type: "string" },
                  { type: "null" }
                ]
              },
              actions: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    action: {
                      type: "string",
                      enum: %w[add delete change]
                    },
                    date: {
                      type: "string"
                    },
                    start_time: {
                      anyOf: [
                        { type: "string" },
                        { type: "null" }
                      ]
                    },
                    end_time: {
                      anyOf: [
                        { type: "string" },
                        { type: "null" }
                      ]
                    }
                  },
                  required: %w[action date start_time end_time]
                }
              }
            },
            required: %w[shop_name actions]
          }
        }
      }
    end

    def prompt_for(text, posted_at:)
      ShiftParser.prompt_for(text, posted_at: posted_at)
    end
  end
end
