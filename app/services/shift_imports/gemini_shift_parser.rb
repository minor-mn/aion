require "net/http"
require "json"
require "base64"

module ShiftImports
  class GeminiShiftParser
    API_BASE = "https://generativelanguage.googleapis.com/v1beta".freeze
    MODEL = ENV.fetch("GEMINI_MODEL", "gemini-2.0-flash")

    def initialize(api_key: ENV["GEMINI_API_KEY"])
      @api_key = api_key
    end

    def parse_post(text, image_urls: [], posted_at: nil)
      raise "GEMINI_API_KEY is not configured" if @api_key.blank?

      TwitterStreamLogger.info("gemini_request_start length=#{text.to_s.length} image_count=#{image_urls.size}")
      uri = URI("#{API_BASE}/models/#{MODEL}:generateContent?key=#{@api_key}")
      request = Net::HTTP::Post.new(uri)
      request["Content-Type"] = "application/json"
      request.body = JSON.generate(
        contents: [
          {
            parts: build_parts(text, image_urls, posted_at: posted_at)
          }
        ],
        generationConfig: {
          responseMimeType: "application/json"
        }
      )

      response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, read_timeout: 60, open_timeout: 10) do |http|
        http.request(request)
      end

      TwitterStreamLogger.info("gemini_request_finish status=#{response.code}")
      raise "Gemini request failed: #{response.code} #{response.body}" unless response.is_a?(Net::HTTPSuccess)

      body = JSON.parse(response.body)
      text_response = body.dig("candidates", 0, "content", "parts", 0, "text").to_s
      parsed = JSON.parse(extract_json(text_response))
      TwitterStreamLogger.info("gemini_parse_success actions=#{parsed.fetch('actions', []).size}")
      parsed
    rescue JSON::ParserError => e
      TwitterStreamLogger.error("gemini_parse_error #{e.message}")
      raise
    end

    private

    def build_parts(text, image_urls, posted_at:)
      parts = [
        {
          text: prompt_for(text, posted_at: posted_at)
        }
      ]

      image_urls.each do |url|
        inline_data = fetch_image_inline_data(url)
        next unless inline_data

        parts << { inlineData: inline_data }
      end

      parts
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
        - For posts like "3.30 おひさま" or "3/30 おひさま", treat that as a shift announcement for that date using the mapped time range.
        - If a date is explicitly written, always use that written date.
        - If no date is written for a keyword-based announcement, use the post timestamp to infer the date:
          - if the post time is 17:00 or earlier, use the same calendar day as the post
          - if the post time is later than 17:00, use the next calendar day
        - The post timestamp is #{posted_at&.iso8601 || 'unknown'}.
        - If only a day-of-month is mentioned, infer the year/month from the post timestamp unless the content clearly indicates otherwise.
        - Preserve date and time exactly if present.
        - If end_time is earlier than start_time, keep it as written. The application will treat it as next day.

        Post:
        #{text}
      PROMPT
    end

    def fetch_image_inline_data(url)
      uri = URI.parse(url)
      response = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https", read_timeout: 30, open_timeout: 10) do |http|
        http.request(Net::HTTP::Get.new(uri))
      end

      unless response.is_a?(Net::HTTPSuccess)
        TwitterStreamLogger.warn("gemini_image_fetch_failed url=#{url} status=#{response.code}")
        return nil
      end

      mime_type = response["content-type"].to_s.split(";").first.presence || infer_mime_type(url)
      {
        mimeType: mime_type,
        data: Base64.strict_encode64(response.body)
      }
    rescue StandardError => e
      TwitterStreamLogger.warn("gemini_image_fetch_error url=#{url} #{e.class}: #{e.message}")
      nil
    end

    def infer_mime_type(url)
      case File.extname(URI.parse(url).path).downcase
      when ".png" then "image/png"
      when ".webp" then "image/webp"
      else "image/jpeg"
      end
    rescue URI::InvalidURIError
      "image/jpeg"
    end

    def extract_json(text)
      stripped = text.strip
      return stripped unless stripped.start_with?("```")

      stripped.sub(/\A```json\s*/i, "").sub(/\A```\s*/i, "").sub(/```\z/, "").strip
    end
  end
end
