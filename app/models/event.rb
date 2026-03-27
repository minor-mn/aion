class Event < ApplicationRecord
  belongs_to :shop
  belongs_to :user, optional: true

  validates :title, presence: true
end
