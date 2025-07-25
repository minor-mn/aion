class StaffPreference < ApplicationRecord
  belongs_to :user
  belongs_to :staff

  validates :user_id, :staff_id, presence: true
  validates :score, presence: true, numericality: { only_integer: true, greater_than_or_equal_to: -10, less_than_or_equal_to: 10 }
end
