class Staff < ApplicationRecord
  belongs_to :shop
  has_many :staff_shifts
  has_many :staff_preferences

  validates :name, presence: true
end
