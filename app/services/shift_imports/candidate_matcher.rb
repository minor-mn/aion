require "uri"
require "set"

module ShiftImports
  class CandidateMatcher
    X_HOSTS = %w[x.com www.x.com twitter.com www.twitter.com mobile.twitter.com mobile.x.com].freeze

    def match_shop(name)
      return nil if name.blank?

      Shop.find_by(name: name) || unique_partial_match(Shop.all, name)
    end

    def match_staff(shop:, name: nil, username: nil)
      staff = match_staff_by_username(shop: shop, username: username)
      return staff if staff
      return nil if name.blank?

      scope = shop ? shop.staffs : Staff.all
      scope.find_by(name: name) || unique_partial_match(scope, name)
    end

    def target_username?(username)
      return false if username.blank?

      tracked_usernames.include?(normalize_username(username))
    end

    def username_from_site_url(value)
      username = normalize_username(extract_username_from_url(value))
      return nil if username.blank?
      return nil unless x_site_url?(value)

      username
    end

    private

    def tracked_usernames
      @tracked_usernames ||= Staff.where.not(site_url: [ nil, "" ]).pluck(:site_url).filter_map do |site_url|
        username_from_site_url(site_url)
      end.to_set
    end

    def match_staff_by_username(shop:, username:)
      return nil if username.blank?

      scope = shop ? shop.staffs : Staff.all
      normalized = normalize_username(username)
      scope.detect do |staff|
        normalize_username(extract_username_from_url(staff.site_url)) == normalized
      end
    end

    def unique_partial_match(scope, name)
      matches = scope.where("name ILIKE ?", "%#{sanitize_like(name)}%").limit(2).to_a
      matches.one? ? matches.first : nil
    end

    def sanitize_like(value)
      value.to_s.gsub(/[\\%_]/) { |m| "\\#{m}" }
    end

    def extract_username_from_url(value)
      return nil if value.blank?

      stripped = value.to_s.strip.sub(/\A@/, "")
      return stripped unless stripped.include?("/")

      uri = URI.parse(stripped)
      uri.path.to_s.split("/").reject(&:blank?).first
    rescue URI::InvalidURIError
      stripped
    end

    def normalize_username(value)
      value.to_s.strip.downcase.sub(/\A@/, "")
    end

    def x_site_url?(value)
      stripped = value.to_s.strip
      return true if stripped.start_with?("@")
      return false unless stripped.include?("/")

      uri = URI.parse(stripped)
      X_HOSTS.include?(uri.host.to_s.downcase)
    rescue URI::InvalidURIError
      false
    end
  end
end
