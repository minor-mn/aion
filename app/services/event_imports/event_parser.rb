module EventImports
  module EventParser
    def self.build(env: ENV)
      if GeminiClient.configured?(env)
        GeminiEventParser.new(
          api_key: env["GEMINI_API_KEY"],
          model: env["GEMINI_MODEL"]
        )
      else
        OpenaiEventParser.new(
          api_key: env["OPENAI_API_KEY"],
          model: env["OPENAI_MODEL"].presence || OpenaiEventParser::DEFAULT_MODEL
        )
      end
    end

    def self.build_prompt(url:, title:, text:)
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
