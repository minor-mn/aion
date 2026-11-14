module ShiftImports
  module ShiftParser
    def self.build(env: ENV)
      if GeminiClient.configured?(env)
        fallback_parser = if OpenaiShiftParser.configured?(env)
          OpenaiShiftParser.new(
            api_key: env["OPENAI_API_KEY"],
            model: OpenaiShiftParser.model_from(env)
          )
        end

        GeminiShiftParser.new(
          api_key: env["GEMINI_API_KEY"],
          model: env["GEMINI_MODEL"],
          fallback_parser: fallback_parser
        )
      else
        OpenaiShiftParser.new(
          api_key: env["OPENAI_API_KEY"],
          model: OpenaiShiftParser.model_from(env) || OpenaiShiftParser::DEFAULT_MODEL
        )
      end
    end

    def self.prompt_for(text, posted_at:)
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
        - Compact date-list posts such as "11月前半🎀\n1.3.4.6.8.(10).(12).(13).15" (a month or period heading like "11月前半" / "11月後半" followed by dot-, comma-, slash-, or space-separated day numbers) ARE work schedule announcements. Return one "add" action per listed day, including parenthesized days like "(10)" unless explicitly marked as off/absent.
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
          - "11月前半🎀\n1.3.4.6.8.(10).(12).(13).15"
        - Examples that SHOULD NOT be treated as shift announcements:
          - "本日おーらすでした"
          - "おつきさまありがとう"
          - "おーらす楽しかった"
          - "昨日はおひさまでした"
        - For posts like "3.30 おひさま" or "3/30 おひさま", treat that as a shift announcement for that date using the mapped time range.
        - If a date is explicitly written, always use that written date.
        - If a month is written without a year (e.g., "11月前半"), infer the year from the post timestamp (using the next year if e.g. January is announced in December).
        - If no date is written for a keyword-based announcement, use the post timestamp to infer the date:
          - if the post time is earlier than 23:00, use the same calendar day as the post
          - if the post time is 23:00 or later, use the next calendar day
        - The post timestamp is #{posted_at&.iso8601 || 'unknown'}.
        - If only a day-of-month is mentioned without a month (e.g., "13日", "次回13日"), use the next upcoming occurrence of that day-of-month from the post timestamp unless the content clearly indicates otherwise:
          - if that day-of-month is on or after the post timestamp's day-of-month, use the post timestamp's year and month
          - if that day-of-month has already passed in the post timestamp's month (for example, "13日" posted on May 31), use the next month (e.g., June 13, rolling over to January of the next year if posted in December)
        - When a shift announcement ("add") has no time specified (neither start_time nor end_time is written, and no keyword-based shift label applies), return "17:00" for start_time and "23:00" for end_time.
        - If only start_time is written and end_time is omitted (e.g., "18:00~" or "20:30~"), keep start_time as written and return null for end_time.
        - Preserve date and time exactly if present.
        - If end_time is earlier than start_time, keep it as written. The application will treat it as next day.

        Post:
        #{text}
      PROMPT
    end
  end
end
