module ShiftImports
  class ImportFromXList
    def initialize(client: XListClient.new, parser: ShiftImports::OpenaiShiftParser.new, matcher: CandidateMatcher.new)
      @client = client
      @parser = parser
      @matcher = matcher
    end

    def call
      staffs = tracked_staffs
      TwitterStreamLogger.info("import_start tracked_staff_count=#{staffs.size}")

      imported_count = 0
      had_errors = false

      staffs.each do |staff|
        result = import_staff_timeline(staff)
        imported_count += result.fetch(:imported_count)
        had_errors ||= result.fetch(:had_errors)
      end

      { imported_count: imported_count, had_errors: had_errors, tracked_staff_count: staffs.count }
    rescue StandardError => e
      TwitterStreamLogger.error("import_error #{e.class}: #{e.message}")
      TwitterStreamLogger.error(e.backtrace.join("\n")) if e.backtrace
      raise
    ensure
      TwitterStreamLogger.info("import_finish")
    end

    private

    def tracked_staffs
      Staff.where.not(site_url: [ nil, "" ]).to_a
        .select { |staff| @matcher.username_from_site_url(staff.site_url).present? }
    end

    def import_staff_timeline(staff)
      username = @matcher.username_from_site_url(staff.site_url)
      return { imported_count: 0, had_errors: false } if username.blank?

      TwitterStreamLogger.info("staff_import_start staff_id=#{staff.id} username=#{username}")
      ensure_twitter_user_id!(staff, username)

      response = fetch_staff_tweets(staff, username)
      tweets = response.fetch("data", [])
      meta = response.fetch("meta", {})
      includes = response.fetch("includes", {})
      media_by_key = includes.fetch("media", []).index_by { |media| media.fetch("media_key") }

      if tweets.empty?
        TwitterStreamLogger.info("staff_import_no_new_posts staff_id=#{staff.id} username=#{username} since_id=#{staff.twitter_since_id}")
        return { imported_count: 0, had_errors: false }
      end

      imported_count = 0
      had_errors = false
      latest_post_id = meta["newest_id"] || tweets.map { |tweet| tweet.fetch("id") }.max_by(&:to_i)
      tweets.sort_by { |tweet| tweet.fetch("id").to_i }.each do |tweet|
        result = import_tweet(
          tweet,
          media_by_key: media_by_key,
          username: username,
          staff: staff,
          shop: staff.shop
        )
        imported_count += result.fetch(:imported_count)
        had_errors ||= result.fetch(:had_errors)
      end

      staff.update!(twitter_since_id: latest_post_id)
      TwitterStreamLogger.info(
        "staff_import_finish staff_id=#{staff.id} username=#{username} imported_count=#{imported_count} had_errors=#{had_errors} new_since_id=#{latest_post_id}"
      )
      { imported_count: imported_count, had_errors: had_errors }
    end

    def ensure_twitter_user_id!(staff, username)
      return if staff.twitter_user_id.present?

      response = @client.fetch_user_by_username(username: username)
      twitter_user_id = response.dig("data", "id")
      raise "X user lookup returned no data for @#{username}" if twitter_user_id.blank?

      staff.update!(twitter_user_id: twitter_user_id)
      TwitterStreamLogger.info("staff_import_set_user_id staff_id=#{staff.id} username=#{username} twitter_user_id=#{twitter_user_id}")
    end

    def fetch_staff_tweets(staff, username)
      if staff.twitter_since_id.present?
        TwitterStreamLogger.info(
          "staff_import_fetch_since_id staff_id=#{staff.id} username=#{username} since_id=#{staff.twitter_since_id}"
        )
        @client.fetch_user_tweets(user_id: staff.twitter_user_id, since_id: staff.twitter_since_id)
      else
        TwitterStreamLogger.info(
          "staff_import_fetch_latest staff_id=#{staff.id} username=#{username} max_results=5"
        )
        @client.fetch_user_tweets(user_id: staff.twitter_user_id, max_results: 5)
      end
    end

    def import_tweet(tweet, media_by_key:, username:, staff: nil, shop: nil)
      post_id = tweet.fetch("id")
      raw_text = tweet.fetch("text")
      posted_at = Time.zone.parse(tweet["created_at"].to_s) if tweet["created_at"].present?
      post_url = "https://x.com/i/web/status/#{post_id}"

      TwitterStreamLogger.info("tweet_process_start post_id=#{post_id} username=#{username || '-'}")

      if retweet?(tweet)
        TwitterStreamLogger.info("tweet_process_skip post_id=#{post_id} reason=retweet username=#{username || '-'}")
        return { imported_count: 0, had_errors: false }
      end

      image_urls = extract_image_urls(tweet, media_by_key)
      TwitterStreamLogger.info("tweet_process_tracked_username post_id=#{post_id} username=#{username || '-'} image_count=#{image_urls.size}")

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

    def retweet?(tweet)
      Array(tweet["referenced_tweets"]).any? { |reference| reference["type"] == "retweeted" }
    end
  end
end
