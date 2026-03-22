class ScheduleShiftNotificationsJob < ApplicationJob
  queue_as :default

  def perform(shift_id)
    shift = StaffShift.includes(staff: :shop).find_by(id: shift_id)
    return unless shift

    staff = shift.staff

    # Find all users who have a preference for this staff and notifications enabled
    NotificationSetting.where(notifications_enabled: true)
                       .where("notify_minutes_before > 0")
                       .includes(:user)
                       .find_each do |setting|
      user = setting.user
      preference = user.staff_preferences.find_by(staff_id: staff.id)
      next unless preference

      score = preference.score

      # Check staff score threshold
      staff_qualifies = score >= setting.score_threshold_staff

      # Check shop score threshold (sum of all staff scores in the same shop for that day)
      shop_qualifies = false
      day_begin = shift.start_at.beginning_of_day
      day_end = shift.start_at.end_of_day
      shop_shifts = StaffShift.where(shop_id: shift.shop_id, start_at: day_begin..day_end)
      preferences = user.staff_preferences.where(staff_id: shop_shifts.select(:staff_id)).index_by(&:staff_id)
      shop_total = shop_shifts.sum { |s| preferences[s.staff_id]&.score || 0 }
      shop_qualifies = shop_total >= setting.score_threshold_shop

      next unless staff_qualifies || shop_qualifies

      notify_at = shift.start_at - setting.notify_minutes_before.minutes
      next if notify_at <= Time.current

      ShiftNotificationJob.set(wait_until: notify_at).perform_later(
        user.id,
        shift.id,
        setting.notify_minutes_before
      )
    end
  end
end
