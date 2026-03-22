require "openssl"
require "net/http"
require "json"
require "base64"

class FcmService
  TOKEN_URI = "https://oauth2.googleapis.com/token".freeze
  FCM_SCOPE = "https://www.googleapis.com/auth/firebase.cloud-messaging".freeze

  def self.send_notification(fcm_token, title:, body:)
    new.send_notification(fcm_token, title: title, body: body)
  end

  def send_notification(fcm_token, title:, body:)
    unless service_account_json.present?
      Rails.logger.warn("[FCM] FIREBASE_SERVICE_ACCOUNT_JSON not set")
      return false
    end

    access_token = fetch_access_token
    unless access_token
      Rails.logger.warn("[FCM] アクセストークンを取得できませんでした")
      return false
    end

    project_id = parsed_service_account["project_id"]
    unless project_id
      Rails.logger.warn("[FCM] project_id が見つかりません")
      return false
    end

    uri = URI("https://fcm.googleapis.com/v1/projects/#{project_id}/messages:send")

    message = {
      message: {
        token: fcm_token,
        notification: {
          title: title,
          body: body
        },
        webpush: {
          notification: {
            icon: "/icons/icon-192x192.png",
            badge: "/icons/icon-192x192.png"
          }
        }
      }
    }

    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true

    request = Net::HTTP::Post.new(uri.path)
    request["Authorization"] = "Bearer #{access_token}"
    request["Content-Type"] = "application/json"
    request.body = message.to_json

    response = http.request(request)

    if response.code.to_i == 200
      Rails.logger.info("[FCM] Sent to #{fcm_token[0..20]}...")
      true
    else
      Rails.logger.warn("[FCM] Failed (#{response.code}): #{response.body}")
      if response.code.to_i == 404
        FcmToken.where(token: fcm_token).destroy_all
      end
      false
    end
  rescue => e
    Rails.logger.error("[FCM] Error: #{e.message}")
    false
  end

  private

  def service_account_json
    @service_account_json ||= begin
      value = ENV["FIREBASE_SERVICE_ACCOUNT_JSON"]
      return nil if value.blank?

      if value.start_with?("/") || value.start_with?("./")
        File.read(value)
      else
        value
      end
    end
  end

  def parsed_service_account
    @parsed_service_account ||= JSON.parse(service_account_json)
  end

  # OAuth2 JWT assertion flow を直接実装（googleauth gemに依存しない）
  def fetch_access_token
    sa = parsed_service_account
    private_key = OpenSSL::PKey::RSA.new(sa["private_key"])

    now = Time.now.to_i
    jwt_header = { alg: "RS256", typ: "JWT" }
    jwt_payload = {
      iss: sa["client_email"],
      scope: FCM_SCOPE,
      aud: TOKEN_URI,
      iat: now,
      exp: now + 3600
    }

    segments = [
      base64url_encode(jwt_header.to_json),
      base64url_encode(jwt_payload.to_json)
    ]
    signing_input = segments.join(".")
    signature = private_key.sign("SHA256", signing_input)
    jwt = "#{signing_input}.#{base64url_encode(signature)}"

    uri = URI(TOKEN_URI)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true

    request = Net::HTTP::Post.new(uri.path)
    request["Content-Type"] = "application/x-www-form-urlencoded"
    request.body = URI.encode_www_form(
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    )

    response = http.request(request)
    result = JSON.parse(response.body)

    if result["access_token"]
      result["access_token"]
    else
      Rails.logger.warn("[FCM] Token exchange failed: #{response.body}")
      nil
    end
  rescue => e
    Rails.logger.error("[FCM] Token fetch error: #{e.message}")
    nil
  end

  def base64url_encode(data)
    Base64.urlsafe_encode64(data, padding: false)
  end
end
