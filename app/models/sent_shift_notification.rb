class SentShiftNotification < ApplicationRecord
  self.cleanup_before = 30.days

  belongs_to :user
  belongs_to :shop

  validates :start_at, :kind, :body, presence: true
  validates :kind, uniqueness: { scope: [ :user_id, :shop_id, :start_at ] }
end
