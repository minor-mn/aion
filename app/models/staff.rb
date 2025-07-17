class Staff < ApplicationRecord
  has_many :staff_shifts
  has_many :shops, through: :staff_shifts

  validates :name, presence: true
end
