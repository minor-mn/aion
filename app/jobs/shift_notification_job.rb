class ShiftNotificationJob < ApplicationJob
  queue_as :default

  def perform(user_id, shift_id, minutes_before)
    user = User.find_by(id: user_id)
    return unless user

    shift = StaffShift.includes(staff: :shop).find_by(id: shift_id)
    return unless shift

    setting = user.notification_setting
    return unless setting&.notifications_enabled

    staff = shift.staff
    shop = staff.shop

    # TODO: Implement actual push notification delivery (e.g. Web Push / FCM)
    # For now, log the notification
    Rails.logger.info(
      "[ShiftNotification] user=#{user.id} staff=#{staff.name} shop=#{shop.name} " \
      "start_at=#{shift.start_at} minutes_before=#{minutes_before}"
    )
  end
end
