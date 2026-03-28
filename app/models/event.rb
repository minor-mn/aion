class Event < ApplicationRecord
  belongs_to :shop
  belongs_to :user, optional: true

  validates :title, :start_at, :end_at, presence: true
  validate :end_at_not_before_start_at
  validate :duration_within_31_days

  private

  def end_at_not_before_start_at
    return if start_at.blank? || end_at.blank?
    return if end_at >= start_at

    errors.add(:end_at, "は開始日時以降にしてください")
  end

  def duration_within_31_days
    return if start_at.blank? || end_at.blank?
    return if end_at < start_at
    return if end_at - start_at < 32.days

    errors.add(:end_at, "は開始日時から31日以内にしてください")
  end
end
