class ScheduleShiftNotificationsJob < ApplicationJob
  queue_as :default

  # Called when a same-day shift is created after the daily 5:00 scheduler has run.
  # Re-evaluates the entire day for each affected user and schedules notification
  # only if this shift creates the earliest qualifying time slot.
  def perform(shift_id)
    shift = StaffShift.includes(staff: :shop).find_by(id: shift_id)
    return unless shift

    day_begin = shift.start_at.beginning_of_day
    day_end = shift.start_at.end_of_day

    NotificationSetting.where(notifications_enabled: true)
                       .where("notify_minutes_before > 0")
                       .includes(:user)
                       .find_each do |setting|
      user = setting.user
      preferences = user.staff_preferences.includes(:staff).index_by(&:staff_id)
      staff_ids = preferences.keys

      # Skip if user has no preference for this shift's staff
      next unless staff_ids.include?(shift.staff_id)

      # Get all of this user's tracked shifts for the day
      all_shifts = StaffShift.where(staff_id: staff_ids)
                             .where(start_at: day_begin..day_end)
                             .includes(staff: :shop)

      # Find the earliest qualifying time slot
      slots = all_shifts.group_by(&:start_at).sort_by(&:first)

      slots.each do |start_at, slot_shifts|
        total_score = slot_shifts.sum { |s| preferences[s.staff_id]&.score || 0 }
        next unless total_score >= setting.score_threshold_shop

        notify_at = start_at - setting.notify_minutes_before.minutes
        next if notify_at <= Time.current

        body = NotificationBodyBuilder.build(start_at, slot_shifts)
        ShiftNotificationJob.set(wait_until: notify_at).perform_later(user.id, body)
        break
      end
    end
  end
end
