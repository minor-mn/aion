class Event < ApplicationRecord
  belongs_to :shop

  validates :title, presence: true
end
