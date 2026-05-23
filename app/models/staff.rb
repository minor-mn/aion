class Staff < ApplicationRecord
  belongs_to :shop
  belongs_to :user, optional: true
  has_many :staff_shifts, dependent: :destroy
  has_many :staff_preferences, dependent: :destroy
  has_many :shift_import_candidates, dependent: :nullify
  has_many :seat_availabilities, dependent: :destroy
  has_many :staff_rates, dependent: :destroy
  has_many :total_rates, dependent: :destroy

  validates :name, presence: true, uniqueness: { scope: :shop_id, message: "は同じ店舗内で既に登録されています" }
end
