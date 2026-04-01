require "net/http"
require "json"

module ShiftImports
  class OpenaiShiftParser
    API_BASE = "https://api.openai.com/v1".freeze
    MODEL = ENV.fetch("OPENAI_MODEL", "gpt-4.1-mini")

    def initialize(api_key: ENV["OPENAI_API_KEY"])
      @api_key = api_key
    end

    def parse_post(text, image_urls: [], posted_at: nil)
      raise "OPENAI_API_KEY is not configured" if @api_key.blank?

      TwitterStreamLogger.info("openai_request_start length=#{text.to_s.length} image_count=#{image_urls.size}")
      uri = URI("#{API_BASE}/chat/completions")
      request = Net::HTTP::Post.new(uri)
      request["Content-Type"] = "application/json"
      request["Authorization"] = "Bearer #{@api_key}"
      request.body = JSON.generate(
        model: MODEL,
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
      <<~PROMPT
        Extract a work schedule announcement from the following X post and any attached schedule images.
        Return strict JSON with this shape only:
        {
          "shop_name": "string or null",
          "actions": [
            {
              "action": "add or delete or change",
              "date": "YYYY-MM-DD",
              "start_time": "HH:MM or null",
              "end_time": "HH:MM or null"
            }
          ]
        }

        Rules:
        - If the post is not a work schedule announcement, return {"shop_name":null,"actions":[]}
        - Do not include markdown fences.
        - "add" means a new shift is announced.
        - "delete" means the staff is absent or off on that date. For delete, start_time and end_time may be null.
        - "change" means the shift time for that date changed. For change, return the changed time as start_time/end_time.
        - If there is an attached image containing a shift schedule, prefer the image over the post text.
        - Resolve words like "today", "tomorrow", "本日", "明日", "次回13日" using the post date context.
        - If the post mentions multiple relative days such as "今日明日", "本日明日", "今日と明日", or "明日明後日", return one action per day.
        - For example, "今日明日いません" should return two delete actions for today and tomorrow.
        - If the post uses these keyword-based shift labels, convert them to add actions with these exact times:
          - "おひさま" => 12:00 to 17:00
          - "おつきさま" => 17:00 to 22:00
          - "おーらす" => 12:00 to 22:00
        - If a short, abstract, or otherwise meaningless word contains one of these labels, treat it as that shift label.
        - In other words, if the post is essentially just a compact variant of one of these labels, interpret it as a shift announcement even when extra suffixes or surrounding characters are attached.
        - However, do not treat every mention of these words as a shift announcement. First determine whether the post is announcing a future or current shift, rather than reporting after the fact.
        - If the post is a past-tense report, post-shift greeting, thanks message, or reflection, return no actions.
        - Examples that SHOULD be treated as shift announcements:
          - "おーらすbot"
          - "明日おつきさま"
          - "本日おひさま"
          - "4/3 おーらす"
        - Examples that SHOULD NOT be treated as shift announcements:
          - "本日おーらすでした"
          - "おつきさまありがとう"
          - "おーらす楽しかった"
          - "昨日はおひさまでした"
        - For posts like "3.30 おひさま" or "3/30 おひさま", treat that as a shift announcement for that date using the mapped time range.
        - If a date is explicitly written, always use that written date.
        - If no date is written for a keyword-based announcement, use the post timestamp to infer the date:
          - if the post time is earlier than 23:00, use the same calendar day as the post
          - if the post time is 23:00 or later, use the next calendar day
        - The post timestamp is #{posted_at&.iso8601 || 'unknown'}.
        - If only a day-of-month is mentioned, infer the year/month from the post timestamp unless the content clearly indicates otherwise.
        - Preserve date and time exactly if present.
        - If end_time is earlier than start_time, keep it as written. The application will treat it as next day.

        Post:
        #{text}
      PROMPT
    end
  end
end
