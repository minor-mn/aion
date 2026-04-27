module ShiftImports
  class ImportFromXList
    TWITTER_NOT_FOUND_DELETE_THRESHOLD = 25
    DELETE_INTENT_REGEX = /(いませ|やすみ|休み|居ませ)/.freeze

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
      sync_staff_profile_from_x!(staff, username)

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
    rescue XListClient::RequestError => e
      return { imported_count: 0, had_errors: false } if e.status == 404

      raise
    end

    def sync_staff_profile_from_x!(staff, username)
      response = @client.fetch_user_by_username(username: username)
      twitter_user_id = response.dig("data", "id")
      raise "X user lookup returned no data for @#{username}" if twitter_user_id.blank?

      attributes = {}
      if staff.twitter_user_id != twitter_user_id
        attributes[:twitter_user_id] = twitter_user_id
      end

      x_name = response.dig("data", "name").to_s.strip
      if x_name.present? && x_name != staff.name
        duplicated_name = Staff.where(shop_id: staff.shop_id, name: x_name).where.not(id: staff.id).exists?
        if duplicated_name
          TwitterStreamLogger.warn(
            "staff_import_skip_name_update staff_id=#{staff.id} username=#{username} reason=duplicated_name"
          )
        else
          attributes[:name] = x_name
        end
      end

      profile_image_url = response.dig("data", "profile_image_url")
      normalized_profile_image_url = normalize_profile_image_url(profile_image_url)
      if normalized_profile_image_url.present? && normalized_profile_image_url != staff.image_url
        attributes[:image_url] = normalized_profile_image_url
      end
      attributes[:twitter_not_found_count] = 0 if staff.twitter_not_found_count.to_i.positive?

      if attributes.present?
        staff.update!(attributes)
        TwitterStreamLogger.info(
          "staff_import_sync_profile staff_id=#{staff.id} username=#{username} changed=#{attributes.keys.join(',')}"
        )
      end
    rescue XListClient::RequestError => e
      raise unless e.status == 404

      handle_twitter_not_found!(staff, username)
      raise
    end

    def fetch_staff_tweets(staff, username)
      if staff.twitter_user_id.blank?
        raise "X user id is missing for @#{username}"
      end

      response = if staff.twitter_since_id.present?
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

      reset_twitter_not_found_count!(staff, username)
      response
    rescue XListClient::RequestError => e
      raise unless e.status == 404

      handle_twitter_not_found!(staff, username)
      raise
    end

    def import_tweet(tweet, media_by_key:, username:, staff: nil, shop: nil)
      post_id = tweet.fetch("id")
      raw_text = tweet.fetch("text")
      posted_at = Time.zone.parse(tweet["created_at"].to_s) if tweet["created_at"].present?
      post_url = "https://x.com/i/web/status/#{post_id}"
      image_urls = extract_image_urls(tweet, media_by_key)

      TwitterStreamLogger.info("tweet_process_start post_id=#{post_id} username=#{username || '-'}")

      if retweet?(tweet)
        log_skipped_tweet!(
          post_id: post_id,
          post_url: post_url,
          posted_at: posted_at,
          raw_text: raw_text,
          username: username,
          shop: shop,
          staff: staff,
          reason: "retweet",
          image_urls: image_urls
        )
        TwitterStreamLogger.info("tweet_process_skip post_id=#{post_id} reason=retweet username=#{username || '-'}")
        return { imported_count: 0, had_errors: false }
      end

      TwitterStreamLogger.info("tweet_process_tracked_username post_id=#{post_id} username=#{username || '-'} image_count=#{image_urls.size}")

      seat_result = record_seat_availability(
        shop: shop,
        staff: staff,
        raw_text: raw_text,
        post_id: post_id,
        post_url: post_url,
        posted_at: posted_at
      )
      TwitterStreamLogger.info("tweet_process_seat post_id=#{post_id} applied=#{seat_result[:applied]} message=#{seat_result[:message]}")

      parsed = @parser.parse_post(raw_text, image_urls: image_urls, posted_at: posted_at)
      actions = Array(parsed["actions"])
      actions = fallback_delete_actions(raw_text: raw_text, posted_at: posted_at, shop: shop, staff: staff) if actions.empty?

      if actions.empty?
        log_skipped_tweet!(
          post_id: post_id,
          post_url: post_url,
          posted_at: posted_at,
          raw_text: raw_text,
          username: username,
          shop: shop,
          staff: staff,
          reason: "no_actions",
          image_urls: image_urls
        )
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
          image_urls: image_urls,
          username: username,
          parsed: parsed,
          shop: shop,
          staff: staff,
          start_at: start_at,
          end_at: end_at
        )

        unless candidate.valid?
          candidate.applied = false
          candidate.result_message = candidate.errors.full_messages.join(", ")
          candidate.save!(validate: false)
          had_errors = true
          TwitterStreamLogger.warn(
            "tweet_process_candidate_skipped post_id=#{post_id} " \
            "action=#{normalized_action.inspect} payload=#{action_data.to_json} errors=#{candidate.result_message}"
          )
          next
        end

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
          candidate.save!(validate: false)
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
      end_at = nil

      if normalized_action != "delete"
        if action_data["end_time"].present?
          end_at = Time.zone.parse("#{date} #{action_data['end_time']}")
          end_at += 1.day if end_at <= start_at
        else
          end_at = default_end_at_for(start_at)
        end
      end

      [ start_at, end_at ]
    end

    def default_end_at_for(start_at)
      if (17..18).cover?(start_at.hour)
        return Time.zone.parse("#{start_at.to_date} 23:00")
      end
      if start_at.hour >= 20
        return Time.zone.parse("#{start_at.to_date} 05:00") + 1.day
      end

      nil
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

    def build_candidate(action:, raw_text:, post_id:, post_url:, posted_at:, image_urls:, username:, parsed:, shop:, staff:, start_at:, end_at:)
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
        raw_text: raw_text,
        source_image_urls: image_urls
      )
    end

    def record_seat_availability(shop:, staff:, raw_text:, post_id:, post_url:, posted_at:)
      ShiftImports::SeatAvailabilityRecorder.new(
        shop: shop,
        staff: staff,
        raw_text: raw_text,
        post_id: post_id,
        post_url: post_url,
        posted_at: posted_at
      ).call
    rescue StandardError => e
      TwitterStreamLogger.warn("tweet_process_seat_failed post_id=#{post_id} message=#{e.class}: #{e.message}")
      { applied: false, message: "#{e.class}: #{e.message}" }
    end

    def fallback_delete_actions(raw_text:, posted_at:, shop:, staff:)
      return [] if staff.blank?
      return [] unless raw_text.to_s.match?(DELETE_INTENT_REGEX)

      target_shift = current_or_next_shift(posted_at: posted_at, shop: shop, staff: staff)
      return [] unless target_shift

      start_at = target_shift.start_at.in_time_zone
      TwitterStreamLogger.info(
        "tweet_process_fallback_delete staff_id=#{staff.id} shop_id=#{shop&.id || '-'} target_shift_id=#{target_shift.id} date=#{start_at.to_date.iso8601}"
      )
      [
        {
          "action" => "delete",
          "date" => start_at.to_date.iso8601,
          "start_time" => start_at.strftime("%H:%M"),
          "end_time" => nil
        }
      ]
    end

    def current_or_next_shift(posted_at:, shop:, staff:)
      base_time = posted_at || Time.current
      scope = StaffShift.where(staff_id: staff.id)
      scope = scope.where(shop_id: shop.id) if shop

      current_shift = scope.where("start_at <= ? AND end_at >= ?", base_time, base_time).order(:start_at).first
      return current_shift if current_shift

      scope.where("start_at >= ?", base_time).order(:start_at).first
    end

    def log_skipped_tweet!(post_id:, post_url:, posted_at:, raw_text:, username:, shop:, staff:, reason:, image_urls: [])
      candidate = ShiftImportCandidate.new(
        action: "skip",
        shop: shop,
        staff: staff,
        parsed_shop_name: shop&.name,
        parsed_staff_name: staff&.name,
        source_username: username,
        start_at: posted_at || Time.current,
        end_at: nil,
        source_post_id: post_id,
        source_post_url: post_url,
        source_posted_at: posted_at,
        raw_text: raw_text,
        source_image_urls: image_urls,
        applied: false,
        result_message: reason
      )
      candidate.save!
    rescue StandardError => e
      TwitterStreamLogger.warn("tweet_process_skip_log_failed post_id=#{post_id} reason=#{reason} message=#{e.class}: #{e.message}")
    end

    def retweet?(tweet)
      Array(tweet["referenced_tweets"]).any? { |reference| reference["type"] == "retweeted" }
    end

    def reset_twitter_not_found_count!(staff, username)
      return unless staff.twitter_not_found_count.to_i.positive?

      staff.update!(twitter_not_found_count: 0)
      TwitterStreamLogger.info("staff_import_reset_not_found_count staff_id=#{staff.id} username=#{username}")
    end

    def handle_twitter_not_found!(staff, username)
      next_count = staff.twitter_not_found_count.to_i + 1
      staff.update!(twitter_not_found_count: next_count)
      TwitterStreamLogger.warn(
        "staff_import_twitter_not_found staff_id=#{staff.id} username=#{username} count=#{next_count}"
      )

      return unless next_count >= TWITTER_NOT_FOUND_DELETE_THRESHOLD

      Staff.transaction do
        staff.staff_shifts.delete_all
        staff.destroy!
      end
      TwitterStreamLogger.warn(
        "staff_import_deleted_staff staff_id=#{staff.id} username=#{username} reason=twitter_not_found_threshold"
      )
    end

    def normalize_profile_image_url(url)
      return if url.blank?

      url.sub("_normal.", ".")
    end
  end
end
