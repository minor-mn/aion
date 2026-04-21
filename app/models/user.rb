class User < ApplicationRecord
  devise :database_authenticatable, :registerable,
         :recoverable, :rememberable, :validatable,
         :confirmable,
         :jwt_authenticatable, jwt_revocation_strategy: JwtDenylist
  has_many :staff_preferences, dependent: :destroy
  has_one :notification_setting, dependent: :destroy
  has_many :push_subscriptions, dependent: :destroy
  has_many :shops, dependent: :nullify
  has_many :staffs, dependent: :nullify
  has_many :events, dependent: :nullify
  has_many :staff_shifts, dependent: :nullify
  has_many :check_ins, dependent: :destroy

  enum :role, { admin: "admin", operator: "operator", user: "user" }, default: :user, validate: true

  def operator_or_admin?
    admin? || operator?
  end

  def jwt_payload
    {
      nickname: nickname,
      email: email,
      role: role
    }
  end
end
