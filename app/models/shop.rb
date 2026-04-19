class Shop < ApplicationRecord
  belongs_to :user, optional: true
  has_many :staffs, dependent: :destroy
  has_many :staff_shifts, dependent: :destroy
  has_many :events, dependent: :destroy
  has_many :seat_availabilities, dependent: :destroy
  has_many :check_ins, dependent: :destroy

  validates :name, presence: true, uniqueness: { message: "は既に登録されています" }
end
