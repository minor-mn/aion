class Staff < ApplicationRecord
  belongs_to :shop
  has_many :staff_shifts
  has_many :staff_preferences

  validates :name, presence: true, uniqueness: { scope: :shop_id, message: "は同じ店舗内で既に登録されています" }
end
