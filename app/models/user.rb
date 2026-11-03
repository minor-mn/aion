class User < ApplicationRecord
  has_many :staff_preferences, dependent: :destroy
  has_one :notification_setting, dependent: :destroy
  has_many :push_subscriptions, dependent: :destroy
  has_many :shops, dependent: :nullify
  has_many :staffs, dependent: :nullify
  has_many :events, dependent: :nullify
  has_many :staff_shifts, dependent: :nullify
  has_many :check_ins, dependent: :destroy

  enum :role, { admin: "admin", operator: "operator", user: "user" }, default: :user, validate: true

  # 認証サーバのトークンのクレームから、紐付くユーザーを返す（初回は作る）。
  # auth_sub の一意性はユニークインデックスで保証し、同時の初回リクエストは create_or_find_by! が吸収する。
  # create_or_find_by! は毎回 INSERT を試すので、既存ユーザーは先に find_by で引く。
  # ユーザー名とニックネームは認証サーバが正なので、変わっていれば写す。
  def self.from_claims(claims)
    sub = claims.fetch("sub")
    user = find_by(auth_sub: sub) || create_or_find_by!(auth_sub: sub)
    user.assign_attributes(username: claims["preferred_username"], nickname: claims["name"])
    user.save! if user.changed?
    user
  end

  def operator_or_admin?
    admin? || operator?
  end

  def server_data_updated_at
    [
      staff_preferences.maximum(:updated_at)
    ].compact.max
  end
end
