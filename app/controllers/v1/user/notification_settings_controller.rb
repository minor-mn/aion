class V1::User::NotificationSettingsController < ApplicationController
  before_action :authenticate_user!
  before_action :require_admin!, only: :test

  # GET /v1/user/notification_settings
  def show
    setting = current_user.notification_setting || current_user.build_notification_setting
    render json: { notification_setting: setting }, status: :ok
  end

  # PATCH /v1/user/notification_settings
  def update
    setting = current_user.notification_setting || current_user.build_notification_setting
    if setting.update(notification_setting_params)
      render json: { message: "通知設定を更新しました", notification_setting: setting }, status: :ok
    else
      render json: { error: setting.errors.full_messages.join(", ") }, status: :unprocessable_entity
    end
  end

  # POST /v1/user/notification_settings/test
  def test
    subscriptions = current_user.push_subscriptions
    return render json: { error: "push subscription がありません" }, status: :unprocessable_entity if subscriptions.empty?

    body = "テスト通知 #{Time.current.strftime('%Y-%m-%d %H:%M:%S')}"
    sent_count = subscriptions.count do |subscription|
      WebPushService.send_notification(subscription, title: "テスト通知", body: body)
    end

    render json: { message: "テスト通知を送信しました", sent_count: sent_count, total_count: subscriptions.size }, status: :ok
  end

  private

  def notification_setting_params
    params.permit(
      :notifications_enabled,
      :score_threshold_shop,
      :score_threshold_staff,
      :notify_morning,
      :notify_minutes_before
    )
  end
end
