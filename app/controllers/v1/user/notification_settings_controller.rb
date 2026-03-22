class V1::User::NotificationSettingsController < ApplicationController
  before_action :authenticate_user!

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
