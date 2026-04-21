class CheckIn < ApplicationRecord
  belongs_to :user
  belongs_to :shop
  has_many :staff_rates, dependent: :destroy

  validates :checked_in_at, presence: true

  scope :active, -> { where(checked_out_at: nil) }

  def active?
    checked_out_at.nil?
  end

  def candidate_staffs
    end_at = checked_out_at || Time.current
    staff_ids = StaffShift.where(shop_id: shop_id)
                          .where("start_at < ? AND end_at > ?", end_at, checked_in_at)
                          .distinct
                          .pluck(:staff_id)
    Staff.where(id: staff_ids).order(:name)
  end
end
