module ShiftImports
  class ImportFromXList
    SOURCE_KEY = "x_list_shifts".freeze

    def initialize(list_id: ENV["X_LIST_ID"], client: XListClient.new, parser: GeminiShiftParser.new, matcher: CandidateMatcher.new)
      @list_id = list_id
      @client = client
      @parser = parser
      @matcher = matcher
    end

    def call
      raise "X_LIST_ID is not configured" if @list_id.blank?

      TwitterStreamLogger.info("import_start list_id=#{@list_id}")
      cursor = ImportCursor.find_or_initialize_by(source_key: SOURCE_KEY)

      if cursor.last_post_id.blank?
        bootstrap!(cursor)
      else
        import_since!(cursor)
      end
    rescue StandardError => e
      TwitterStreamLogger.error("import_error #{e.class}: #{e.message}")
      TwitterStreamLogger.error(e.backtrace.join("\n")) if e.backtrace
      raise
    ensure
      TwitterStreamLogger.info("import_finish list_id=#{@list_id}")
    end

    private

    def bootstrap!(cursor)
      TwitterStreamLogger.info("bootstrap_start")
      response = @client.fetch_list_posts(list_id: @list_id, max_results: 1)
      latest_tweet = response.fetch("data", []).first

      if latest_tweet.blank?
        TwitterStreamLogger.info("bootstrap_no_posts")
        return { bootstrapped: false, imported_count: 0 }
      end

      cursor.update!(last_post_id: latest_tweet.fetch("id"))
      TwitterStreamLogger.info("bootstrap_set_cursor post_id=#{latest_tweet.fetch('id')}")
      { bootstrapped: true, imported_count: 0, last_post_id: cursor.last_post_id }
    end

    def import_since!(cursor)
      TwitterStreamLogger.info("import_since_start last_post_id=#{cursor.last_post_id}")
      response = @client.fetch_list_posts(list_id: @list_id, since_id: cursor.last_post_id)
      tweets = response.fetch("data", [])

      if tweets.empty?
        TwitterStreamLogger.info("import_no_new_posts")
        return { bootstrapped: false, imported_count: 0, last_post_id: cursor.last_post_id }
      end

      imported_count = 0
      had_errors = false
      latest_post_id = tweets.map { |tweet| tweet.fetch("id") }.max_by(&:to_i)
      includes = response.fetch("includes", {})
      users_by_id = includes.fetch("users", []).index_by { |user| user.fetch("id") }
      media_by_key = includes.fetch("media", []).index_by { |media| media.fetch("media_key") }

      tweets.sort_by { |tweet| tweet.fetch("id").to_i }.each do |tweet|
        result = import_tweet(tweet, users_by_id: users_by_id, media_by_key: media_by_key)
        imported_count += result.fetch(:imported_count)
        had_errors ||= result.fetch(:had_errors)
      end

      cursor.update!(last_post_id: latest_post_id)

      TwitterStreamLogger.info(
        "import_since_finish imported_count=#{imported_count} had_errors=#{had_errors} new_last_post_id=#{latest_post_id}"
      )
      { bootstrapped: false, imported_count: imported_count, had_errors: had_errors, last_post_id: latest_post_id }
    end

    def import_tweet(tweet, users_by_id:, media_by_key: {})
      post_id = tweet.fetch("id")
      raw_text = tweet.fetch("text")
      posted_at = Time.zone.parse(tweet["created_at"].to_s) if tweet["created_at"].present?
      post_url = "https://x.com/i/web/status/#{post_id}"
      username = users_by_id[tweet["author_id"]]&.fetch("username", nil)

      TwitterStreamLogger.info("tweet_process_start post_id=#{post_id} username=#{username || '-'}")

      unless @matcher.target_username?(username)
        TwitterStreamLogger.info("tweet_process_skip post_id=#{post_id} reason=untracked_username username=#{username || '-'}")
        return { imported_count: 0, had_errors: false }
      end

      image_urls = extract_image_urls(tweet, media_by_key)
      TwitterStreamLogger.info("tweet_process_tracked_username post_id=#{post_id} username=#{username || '-'} image_count=#{image_urls.size}")
      staff = @matcher.match_staff(shop: nil, username: username)
      shop = staff&.shop

      if staff.blank? || shop.blank?
        TwitterStreamLogger.warn("tweet_process_skip post_id=#{post_id} reason=tracked_username_without_staff username=#{username || '-'}")
        return { imported_count: 0, had_errors: false }
      end

      parsed = @parser.parse_post(raw_text, image_urls: image_urls, posted_at: posted_at)
      actions = Array(parsed["actions"])

      if actions.empty?
        TwitterStreamLogger.info("tweet_process_skip post_id=#{post_id} reason=no_actions")
        return { imported_count: 0, had_errors: false }
      end

      applied_count = 0
      had_errors = false
      actions.each do |action_data|
        normalized_action = normalize_action(action_data["action"])
        start_at, end_at = build_times(action_data, normalized_action)
        candidate = build_candidate(
          action: normalized_action,
          raw_text: raw_text,
          post_id: post_id,
          post_url: post_url,
          posted_at: posted_at,
          username: username,
          parsed: parsed,
          shop: shop,
          staff: staff,
          start_at: start_at,
          end_at: end_at
        )

        begin
          result = ActionApplier.new(
            shop: shop,
            staff: staff,
            action: normalized_action,
            start_at: start_at,
            end_at: end_at
          ).call
          candidate.applied = result[:applied]
          candidate.result_message = result[:message]
          candidate.save!
        rescue StandardError => e
          candidate.applied = false
          candidate.result_message = "#{e.class}: #{e.message}"
          candidate.save!
          had_errors = true
          TwitterStreamLogger.warn(
            "tweet_process_action_skipped post_id=#{post_id} " \
            "action=#{normalized_action.inspect} payload=#{action_data.to_json} message=#{candidate.result_message.inspect}"
          )
          next
        end

        if result[:applied]
          applied_count += 1
        else
          had_errors = true
          TwitterStreamLogger.warn(
            "tweet_process_action_skipped post_id=#{post_id} " \
            "action=#{normalized_action.inspect} payload=#{action_data.to_json} message=#{result[:message].inspect}"
          )
        end
      end

      TwitterStreamLogger.info("tweet_process_finish post_id=#{post_id} applied_count=#{applied_count} matched_shop_id=#{shop&.id || '-'} matched_staff_id=#{staff&.id || '-'}")
      { imported_count: applied_count, had_errors: had_errors }
    end

    def build_times(action_data, normalized_action)
      date = action_data.fetch("date")
      start_at = Time.zone.parse("#{date} #{action_data['start_time'].presence || '00:00'}")
      end_at = if normalized_action != "delete" && action_data["end_time"].present?
        parsed_end_at = Time.zone.parse("#{date} #{action_data['end_time']}")
        parsed_end_at += 1.day if parsed_end_at <= start_at
        parsed_end_at
      end
      [ start_at, end_at ]
    end

    def normalize_action(value)
      case value.to_s.strip.downcase
      when "add", "create", "new"
        "add"
      when "delete", "remove", "cancel", "off", "holiday"
        "delete"
      when "change", "update", "move", "reschedule"
        "change"
      else
        value.to_s.strip.downcase
      end
    end

    def extract_image_urls(tweet, media_by_key)
      media_keys = Array(tweet.dig("attachments", "media_keys"))

      media_keys.filter_map do |media_key|
        media = media_by_key[media_key]
        next unless media
        next unless media["type"] == "photo"

        media["url"] || media["preview_image_url"]
      end
    end

    def build_candidate(action:, raw_text:, post_id:, post_url:, posted_at:, username:, parsed:, shop:, staff:, start_at:, end_at:)
      ShiftImportCandidate.new(
        action: action,
        shop: shop,
        staff: staff,
        parsed_shop_name: parsed["shop_name"],
        parsed_staff_name: parsed["staff_name"],
        source_username: username,
        start_at: start_at,
        end_at: end_at,
        source_post_id: post_id,
        source_post_url: post_url,
        source_posted_at: posted_at,
        raw_text: raw_text
      )
    end
  end
end
