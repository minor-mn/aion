require "json"
require "net/http"

module EventImports
  class OpenaiEventParser
    API_BASE = "https://api.openai.com/v1".freeze
    MODEL = ENV.fetch("OPENAI_MODEL", "gpt-4.1-mini")

    def initialize(api_key: ENV["OPENAI_API_KEY"])
      @api_key = api_key
    end

    def parse_page(url:, title:, text:, image_urls: [])
      raise "OPENAI_API_KEY is not configured" if @api_key.blank?

      uri = URI("#{API_BASE}/chat/completions")
      request = Net::HTTP::Post.new(uri)
      request["Content-Type"] = "application/json"
      request["Authorization"] = "Bearer #{@api_key}"
      request.body = JSON.generate(
        model: MODEL,
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
      <<~PROMPT
        Extract event entries from the following web page.
        Return strict JSON with this shape only:
        {
          "events": [
            {
              "title": "string",
              "url": "string or null",
              "start_at": "ISO8601 string with timezone offset",
              "end_at": "ISO8601 string with timezone offset"
            }
          ]
        }

        Rules:
        - The page is Japanese and all times should be interpreted in Asia/Tokyo timezone unless explicitly stated otherwise.
        - Return one item per actual event occurrence.
        - If the page contains a specific event URL for an entry, include it.
        - If there is no specific event URL, use null.
        - If the page does not contain event schedule information, return {"events":[]}.
        - Do not include markdown fences.
        - Ignore navigation text, shop hours, unrelated notices, and repeated boilerplate.
        - Prefer explicit date/time ranges written in the article body or attached images.
        - This may be an X post with an attached event schedule image. In that case, read the image text and extract the event rows.
        - Japanese headings like "2026年4月のイベント日程", "4月のイベント情報", "→2026年4月のイベント日程" define the year and month for the lines that follow.
        - If a line only has a day number and weekday such as "1日(水)" or "27日(金)", combine it with the most recent month/year heading.
        - If a line has a date range like "28日(土)〜29日(日)" or "4月25日(土)-29日(水)", create one event whose start_at is the first day and end_at is the last day.
        - If a time range like "17時〜23時" or "15:00-23:00" is present, use it.
        - If only one date is given and a time range is shown, use that date for both start_at and end_at.
        - If only a date is shown without time, use 00:00 for start_at and 23:59 for end_at.
        - If an end time is earlier than the start time, assume the end is on the next day.
        - Keep event titles short and user-facing.
        - If an attached image contains an event schedule, prefer the image over short surrounding text.
        - Exclude generic headings like "イベント情報", "イベント日程のお知らせ", "フォローお願いします".
        - The event title should be the actual event name, not just the date line.

        URL:
        #{url}

        Page title:
        #{title}

        Page text:
        #{text}
      PROMPT
    end
  end
end
