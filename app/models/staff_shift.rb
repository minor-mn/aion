class StaffShift < ApplicationRecord
  belongs_to :staff
  belongs_to :shop
  belongs_to :user, optional: true

  validates :start_at, presence: true
  validates :end_at, presence: true
  validate :no_overlapping_shifts

  private

  def no_overlapping_shifts
    return if staff_id.blank? || start_at.blank? || end_at.blank?

    scope = StaffShift.where(staff_id: staff_id)
                      .where("start_at < ? AND end_at > ?", end_at, start_at)
    scope = scope.where.not(id: id) if persisted?

    if scope.exists?
      errors.add(:base, "このキャストには同じ時間帯に既にシフトが登録されています")
    end
  end
end
