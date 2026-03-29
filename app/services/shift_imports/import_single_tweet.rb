module ShiftImports
  class ImportSingleTweet
    def initialize(tweet_id, client: XListClient.new, parser: GeminiShiftParser.new, matcher: CandidateMatcher.new)
      @tweet_id = tweet_id.to_s
      @client = client
      @parser = parser
      @matcher = matcher
    end

    def call
      raise "tweet_id is required" if @tweet_id.blank?

      TwitterStreamLogger.info("single_import_start tweet_id=#{@tweet_id}")
      response = @client.fetch_tweet(tweet_id: @tweet_id)
      tweet = response.fetch("data")
      includes = response.fetch("includes", {})
      users_by_id = includes.fetch("users", []).index_by { |user| user.fetch("id") }
      media_by_key = includes.fetch("media", []).index_by { |media| media.fetch("media_key") }

      importer = ShiftImports::ImportFromXList.new(client: @client, parser: @parser, matcher: @matcher)
      result = importer.send(:import_tweet, tweet, users_by_id: users_by_id, media_by_key: media_by_key)

      result = { tweet_id: @tweet_id, imported_count: result.fetch(:imported_count), had_errors: result.fetch(:had_errors) }
      TwitterStreamLogger.info("single_import_finish tweet_id=#{@tweet_id} imported_count=#{result[:imported_count]} had_errors=#{result[:had_errors]}")
      result
    rescue StandardError => e
      TwitterStreamLogger.error("single_import_error tweet_id=#{@tweet_id} #{e.class}: #{e.message}")
      TwitterStreamLogger.error(e.backtrace.join("\n")) if e.backtrace
      raise
    end
  end
end
