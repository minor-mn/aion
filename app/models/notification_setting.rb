class NotificationSetting < ApplicationRecord
  # The shift notification cron runs every 30 minutes, so shorter lead times would miss shifts.
  MIN_NOTIFY_MINUTES_BEFORE = 30

  belongs_to :user

  validates :user_id, uniqueness: true
  validates :score_threshold_shop, numericality: { only_integer: true, greater_than_or_equal_to: -10, less_than_or_equal_to: 10 }
  validates :score_threshold_staff, numericality: { only_integer: true, greater_than_or_equal_to: -10, less_than_or_equal_to: 10 }
  validates :notify_minutes_before, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  validate :notify_minutes_before_is_off_or_long_enough

  private

  def notify_minutes_before_is_off_or_long_enough
    return unless notify_minutes_before.is_a?(Integer)
    return if notify_minutes_before.zero? || notify_minutes_before >= MIN_NOTIFY_MINUTES_BEFORE

    errors.add(:base, "シフト開始前の通知は0（通知しない）か#{MIN_NOTIFY_MINUTES_BEFORE}分以上で指定してください")
  end
end
