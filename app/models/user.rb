class User < ApplicationRecord
  devise :database_authenticatable, :registerable,
         :recoverable, :rememberable, :validatable,
         :confirmable,
         :jwt_authenticatable, jwt_revocation_strategy: JwtDenylist
  has_many :staff_preferences, dependent: :destroy
  has_one :notification_setting, dependent: :destroy
  has_many :fcm_tokens, dependent: :destroy
end
