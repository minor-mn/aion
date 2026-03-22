class NotificationSetting < ApplicationRecord
  belongs_to :user

  validates :user_id, uniqueness: true
  validates :score_threshold_shop, numericality: { only_integer: true, greater_than_or_equal_to: -10, less_than_or_equal_to: 10 }
  validates :score_threshold_staff, numericality: { only_integer: true, greater_than_or_equal_to: -10, less_than_or_equal_to: 10 }
  validates :notify_minutes_before, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
end
