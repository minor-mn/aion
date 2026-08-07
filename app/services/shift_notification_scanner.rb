class ShiftNotificationScanner
  MAX_LOOKAHEAD = 1.hour
  TITLE = "シフト通知"
  KIND = "shift_start"

  def self.call(now: Time.current)
    new(now: now).call
  end

  def initialize(now: Time.current)
    @now = now.in_time_zone
  end

  def call
    sent_count = 0
    checked_setting_count = 0

    notification_settings.find_each do |setting|
      checked_setting_count += 1
      sent_count += scan_setting(setting)
    end

    { sent_count: sent_count, checked_setting_count: checked_setting_count }
  end

  private

  attr_reader :now

  def notification_settings
    NotificationSetting.where(notifications_enabled: true)
                       .where("notify_minutes_before > 0")
                       .includes(user: :push_subscriptions)
  end

  def scan_setting(setting)
    user = setting.user
    return 0 unless user

    preferences = user.staff_preferences.index_by(&:staff_id)
    staff_ids = preferences.keys
    return 0 if staff_ids.empty?

    lead_time = [ setting.notify_minutes_before.minutes, MAX_LOOKAHEAD ].min
    shifts = StaffShift.where(staff_id: staff_ids)
                       .where("start_at > ? AND start_at <= ?", now, now + lead_time)
                       .includes(staff: :shop)

    shifts.group_by { |shift| [ shift.shop_id, shift.start_at ] }.sum do |(shop_id, start_at), slot_shifts|
      next 0 unless qualifies?(setting, preferences, slot_shifts)

      body = NotificationBodyBuilder.build(start_at, slot_shifts)
      next 0 unless mark_sent(user: user, shop_id: shop_id, start_at: start_at, body: body)

      ShiftNotificationJob.perform_now(user.id, body)
      1
    end
  end

  def qualifies?(setting, preferences, shifts)
    total_score = shifts.sum { |shift| preferences[shift.staff_id]&.score.to_i }
    total_score >= setting.score_threshold_shop
  end

  def mark_sent(user:, shop_id:, start_at:, body:)
    SentShiftNotification.create!(
      user: user,
      shop_id: shop_id,
      start_at: start_at,
      kind: KIND,
      body: body
    )
    true
  rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotUnique
    false
  end
end
