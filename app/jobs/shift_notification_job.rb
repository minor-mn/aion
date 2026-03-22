class ShiftNotificationJob < ApplicationJob
  queue_as :default

  def perform(user_id, body)
    user = User.find_by(id: user_id)
    return unless user

    setting = user.notification_setting
    return unless setting&.notifications_enabled

    # TODO: Implement actual push notification delivery (e.g. Web Push / FCM)
    # For now, log the notification
    Rails.logger.info("[ShiftNotification] user=#{user.id} body=#{body}")
  end
end
