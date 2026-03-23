class ShiftNotificationJob < ApplicationJob
  queue_as :default

  def perform(user_id, body)
    user = User.find_by(id: user_id)
    return unless user

    setting = user.notification_setting
    return unless setting&.notifications_enabled

    subscriptions = user.push_subscriptions
    if subscriptions.empty?
      Rails.logger.info("[ShiftNotification] user=#{user.id} has no push subscriptions, skipping")
      return
    end

    subscriptions.each do |sub|
      WebPushService.send_notification(sub, title: "シフト通知", body: body)
    end
  end
end
