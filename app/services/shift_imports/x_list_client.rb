require "net/http"
require "json"
require "uri"

module ShiftImports
  class XListClient
    API_BASE = "https://api.x.com".freeze

    class RequestError < StandardError
      attr_reader :status, :body

      def initialize(status:, body:)
        @status = status.to_i
        @body = body
        super("X API request failed: #{status} #{body}")
      end
    end

    def initialize(bearer_token: ENV["X_BEARER_TOKEN"])
      @bearer_token = bearer_token
    end

    def fetch_list_posts(list_id:, since_id: nil, max_results: 100)
      raise "X_BEARER_TOKEN is not configured" if @bearer_token.blank?

      params = default_params.merge("max_results" => max_results.to_s)
      params["since_id"] = since_id if since_id.present?

      uri = URI("#{API_BASE}/2/lists/#{list_id}/tweets")
      uri.query = URI.encode_www_form(params)

      TwitterStreamLogger.info("x_request_start list_id=#{list_id} since_id=#{since_id || '-'} max_results=#{max_results}")
      request = Net::HTTP::Get.new(uri)
      request["Authorization"] = "Bearer #{@bearer_token}"

      response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, read_timeout: 30, open_timeout: 10) do |http|
        http.request(request)
      end

      TwitterStreamLogger.info("x_request_finish status=#{response.code}")
      raise RequestError.new(status: response.code, body: response.body) unless response.is_a?(Net::HTTPSuccess)

      JSON.parse(response.body)
    end

    def fetch_user_by_username(username:)
      raise "X_BEARER_TOKEN is not configured" if @bearer_token.blank?

      uri = URI("#{API_BASE}/2/users/by/username/#{username}")
      uri.query = URI.encode_www_form("user.fields" => "id,name,username,profile_image_url")

      TwitterStreamLogger.info("x_user_lookup_start username=#{username}")
      request = Net::HTTP::Get.new(uri)
      request["Authorization"] = "Bearer #{@bearer_token}"

      response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, read_timeout: 30, open_timeout: 10) do |http|
        http.request(request)
      end

      TwitterStreamLogger.info("x_user_lookup_finish username=#{username} status=#{response.code}")
      raise RequestError.new(status: response.code, body: response.body) unless response.is_a?(Net::HTTPSuccess)

      JSON.parse(response.body)
    end

    def fetch_user_tweets(user_id:, since_id: nil, max_results: 100)
      raise "X_BEARER_TOKEN is not configured" if @bearer_token.blank?

      params = default_params.merge(
        "max_results" => max_results.to_s,
        "exclude" => "retweets,replies"
      )
      params["since_id"] = since_id if since_id.present?

      uri = URI("#{API_BASE}/2/users/#{user_id}/tweets")
      uri.query = URI.encode_www_form(params)

      TwitterStreamLogger.info("x_user_tweets_start user_id=#{user_id} since_id=#{since_id || '-'} max_results=#{max_results}")
      request = Net::HTTP::Get.new(uri)
      request["Authorization"] = "Bearer #{@bearer_token}"

      response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, read_timeout: 30, open_timeout: 10) do |http|
        http.request(request)
      end

      TwitterStreamLogger.info("x_user_tweets_finish user_id=#{user_id} status=#{response.code}")
      raise RequestError.new(status: response.code, body: response.body) unless response.is_a?(Net::HTTPSuccess)

      JSON.parse(response.body)
    end

    def fetch_tweet(tweet_id:)
      raise "X_BEARER_TOKEN is not configured" if @bearer_token.blank?

      uri = URI("#{API_BASE}/2/tweets/#{tweet_id}")
      uri.query = URI.encode_www_form(default_params)

      TwitterStreamLogger.info("x_single_request_start tweet_id=#{tweet_id}")
      request = Net::HTTP::Get.new(uri)
      request["Authorization"] = "Bearer #{@bearer_token}"

      response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, read_timeout: 30, open_timeout: 10) do |http|
        http.request(request)
      end

      TwitterStreamLogger.info("x_single_request_finish status=#{response.code}")
      raise RequestError.new(status: response.code, body: response.body) unless response.is_a?(Net::HTTPSuccess)

      JSON.parse(response.body)
    end

    private

    def default_params
      {
        "tweet.fields" => "created_at,author_id,attachments,referenced_tweets",
        "expansions" => "author_id,attachments.media_keys",
        "user.fields" => "username",
        "media.fields" => "type,url,preview_image_url"
      }
    end
  end
end
