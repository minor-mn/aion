class TotalRate < ApplicationRecord
  belongs_to :staff

  validates :year, presence: true, numericality: { only_integer: true }
  validates :staff_id, uniqueness: { scope: :year }

  def self.accumulate!(staff_id:, year:, staff_rate:)
    begin
      record = find_or_create_by!(staff_id: staff_id, year: year)
    rescue ActiveRecord::RecordNotUnique
      record = find_by!(staff_id: staff_id, year: year)
    end

    where(id: record.id).update_all([
      "total_overall_rate = total_overall_rate + ?, " \
      "total_appearance_rate = total_appearance_rate + ?, " \
      "total_service_rate = total_service_rate + ?, " \
      "total_mood_rate = total_mood_rate + ?, " \
      "check_in_count = check_in_count + 1, " \
      "updated_at = ?",
      staff_rate.overall_rate.to_i,
      staff_rate.appearance_rate.to_i,
      staff_rate.service_rate.to_i,
      staff_rate.mood_rate.to_i,
      Time.current
    ])
    record.reload
  end
end
