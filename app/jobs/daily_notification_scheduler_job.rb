class DailyNotificationSchedulerJob < ApplicationJob
  queue_as :default

  def perform
    today_begin = Time.current.beginning_of_day
    today_end = Time.current.end_of_day

    NotificationSetting.where(notifications_enabled: true)
                       .where("notify_minutes_before > 0")
                       .includes(:user)
                       .find_each do |setting|
      schedule_notification_for_user(setting, today_begin, today_end)
    end
  end

  private

  def schedule_notification_for_user(setting, today_begin, today_end)
    user = setting.user
    preferences = user.staff_preferences.includes(:staff).index_by(&:staff_id)
    staff_ids = preferences.keys

    return if staff_ids.empty?

    shifts = StaffShift.where(staff_id: staff_ids)
                       .where(start_at: today_begin..today_end)
                       .includes(staff: :shop)

    return if shifts.empty?

    # Find the earliest time slot where the score threshold is exceeded
    # Group shifts by start_at, then check each time slot in chronological order
    slots = shifts.group_by(&:start_at).sort_by(&:first)

    slots.each do |start_at, slot_shifts|
      # Calculate total score of all staff starting at this time
      total_score = slot_shifts.sum { |s| preferences[s.staff_id]&.score || 0 }

      # Check if threshold is exceeded (shop threshold = total score condition)
      next unless total_score >= setting.score_threshold_shop

      notify_at = start_at - setting.notify_minutes_before.minutes
      next if notify_at <= Time.current

      # Build notification body: "17:00 店舗名 キャスト名1 キャスト名2 キャスト名3"
      body = NotificationBodyBuilder.build(start_at, slot_shifts)

      ShiftNotificationJob.set(wait_until: notify_at).perform_later(user.id, body)

      # Only notify once per day — stop after the first qualifying time slot
      break
    end
  end
end
