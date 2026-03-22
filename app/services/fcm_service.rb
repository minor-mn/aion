require "googleauth"
require "net/http"
require "json"

class FcmService
  FCM_SCOPE = "https://www.googleapis.com/auth/firebase.cloud-messaging".freeze

  def self.send_notification(fcm_token, title:, body:)
    new.send_notification(fcm_token, title: title, body: body)
  end

  def send_notification(fcm_token, title:, body:)
    credentials = build_credentials
    return false unless credentials

    credentials.fetch_access_token!
    access_token = credentials.access_token

    project_id = resolve_project_id
    return false unless project_id

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
      # Remove invalid token (404 = NOT_FOUND means token is stale)
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
    @service_account_json ||= ENV["FIREBASE_SERVICE_ACCOUNT_JSON"]
  end

  def parsed_service_account
    @parsed_service_account ||= JSON.parse(service_account_json)
  end

  def build_credentials
    unless service_account_json.present?
      Rails.logger.warn("[FCM] FIREBASE_SERVICE_ACCOUNT_JSON not set")
      return nil
    end

    Google::Auth::ServiceAccountCredentials.make_creds(
      json_key_io: StringIO.new(service_account_json),
      scope: FCM_SCOPE
    )
  end

  def resolve_project_id
    return nil unless service_account_json.present?

    parsed_service_account["project_id"]
  end
end
