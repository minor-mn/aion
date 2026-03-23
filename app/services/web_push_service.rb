require "web-push"

class WebPushService
  def self.send_notification(subscription, title:, body:)
    new.send_notification(subscription, title: title, body: body)
  end

  def send_notification(subscription, title:, body:)
    vapid_public = ENV["VAPID_PUBLIC_KEY"]
    vapid_private = ENV["VAPID_PRIVATE_KEY"]

    unless vapid_public.present? && vapid_private.present?
      Rails.logger.warn("[WebPush] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set")
      return false
    end

    payload = { title: title, body: body }.to_json

    response = WebPush.payload_send(
      message: payload,
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
      vapid: {
        subject: "mailto:#{ENV.fetch('MAILER_SENDER', 'noreply@example.com')}",
        public_key: vapid_public,
        private_key: vapid_private
      },
      urgency: "high"
    )

    Rails.logger.info("[WebPush] Sent to #{subscription.endpoint[0..50]}...")
    Rails.logger.info("[WebPush] Response: #{response.code} #{response.message}")
    Rails.logger.info("[WebPush] Response body: #{response.body[0..200]}")
    true
  rescue WebPush::ExpiredSubscription
    Rails.logger.info("[WebPush] Subscription expired, removing: #{subscription.endpoint[0..50]}...")
    subscription.destroy
    false
  rescue WebPush::ResponseError => e
    Rails.logger.warn("[WebPush] Failed: #{e.message}")
    false
  rescue => e
    Rails.logger.error("[WebPush] Error: #{e.class} - #{e.message}")
    false
  end
end
