class StaffPreference < ApplicationRecord
  belongs_to :user
  belongs_to :staff

  validates :user_id, :staff_id, presence: true
  validates :score, presence: true, numericality: { only_integer: true, greater_than_or_equal_to: -10, less_than_or_equal_to: 10 }

  def self.shifts_by_date(user, date = nil)
    preferences = user.staff_preferences
    staff_ids = preferences.pluck(:staff_id)

    date = Date.parse(date_str) rescue nil

    if date
      if date_str.length <= 7
        # 指定月
        start_date = date.beginning_of_month
        end_date = date.end_of_month
      else
        # 指定日
        start_date = date.beginning_of_day
        end_date = date.end_of_day
      end
    else
      # 今月
      start_date = Time.current.beginning_of_month
      end_date = Time.current.end_of_month
    end

    StaffShift.where(staff_id: staff_ids, start_at: start_date..end_date)
  end
end
