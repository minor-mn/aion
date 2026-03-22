class DailyNotificationSchedulerJob < ApplicationJob
  queue_as :default

  def perform
    today_begin = Time.current.beginning_of_day
    today_end = Time.current.end_of_day

    # Find all users with notifications enabled and notify_minutes_before > 0
    NotificationSetting.where(notifications_enabled: true)
                       .where("notify_minutes_before > 0")
                       .includes(:user)
                       .find_each do |setting|
      schedule_notifications_for_user(setting, today_begin, today_end)
    end
  end

  private

  def schedule_notifications_for_user(setting, today_begin, today_end)
    user = setting.user
    preferences = user.staff_preferences.index_by(&:staff_id)
    staff_ids = preferences.keys

    return if staff_ids.empty?

    shifts = StaffShift.where(staff_id: staff_ids)
                       .where(start_at: today_begin..today_end)
                       .includes(staff: :shop)

    # Group shifts by shop to calculate shop total scores
    shifts_by_shop = shifts.group_by { |s| s.shop_id }

    # Check shop score threshold condition
    qualifying_shops = shifts_by_shop.select do |_shop_id, shop_shifts|
      total = shop_shifts.sum { |s| preferences[s.staff_id]&.score || 0 }
      total >= setting.score_threshold_shop
    end

    # Check staff score threshold condition
    qualifying_staffs = shifts.select do |shift|
      score = preferences[shift.staff_id]&.score || 0
      score >= setting.score_threshold_staff
    end

    # Combine qualifying shifts (from shop condition OR staff condition)
    qualifying_shift_ids = Set.new
    qualifying_shops.each { |_, shop_shifts| shop_shifts.each { |s| qualifying_shift_ids << s.id } }
    qualifying_staffs.each { |s| qualifying_shift_ids << s.id }

    return if qualifying_shift_ids.empty?

    qualifying_shifts = shifts.select { |s| qualifying_shift_ids.include?(s.id) }

    # Schedule a notification for each qualifying shift
    qualifying_shifts.each do |shift|
      notify_at = shift.start_at - setting.notify_minutes_before.minutes

      # Skip if the notification time has already passed
      next if notify_at <= Time.current

      ShiftNotificationJob.set(wait_until: notify_at).perform_later(
        user.id,
        shift.id,
        setting.notify_minutes_before
      )
    end
  end
end
