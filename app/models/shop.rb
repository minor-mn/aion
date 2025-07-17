class Shop < ApplicationRecord
  has_many :staff_shifts
  has_many :staffs, through: :staff_shifts

  validates :name, presence: true
end
