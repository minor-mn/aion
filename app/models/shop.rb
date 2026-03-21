class Shop < ApplicationRecord
  has_many :staffs, dependent: :destroy
  has_many :staff_shifts, dependent: :destroy

  validates :name, presence: true
end
