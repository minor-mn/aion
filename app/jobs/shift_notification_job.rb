class ShiftNotificationJob < ApplicationJob
  queue_as :default

  def perform(user_id, body)
    user = User.find_by(id: user_id)
    return unless user

    setting = user.notification_setting
    return unless setting&.notifications_enabled

    tokens = user.fcm_tokens.pluck(:token)
    if tokens.empty?
      Rails.logger.info("[ShiftNotification] user=#{user.id} has no FCM tokens, skipping")
      return
    end

    tokens.each do |token|
      FcmService.send_notification(token, title: "シフト通知", body: body)
    end
  end
end
