class V1::User::FcmTokensController < ApplicationController
  before_action :authenticate_user!

  # POST /v1/user/fcm_tokens
  def create
    token = params[:token]
    return render json: { error: "token is required" }, status: :unprocessable_entity if token.blank?

    # If the token already exists for another user, reassign it
    existing = FcmToken.find_by(token: token)
    if existing
      if existing.update(user: current_user)
        render json: { message: "FCMトークンを更新しました" }, status: :ok
      else
        render json: { error: existing.errors.full_messages.join(", ") }, status: :unprocessable_entity
      end
    else
      fcm_token = current_user.fcm_tokens.build(token: token)
      if fcm_token.save
        render json: { message: "FCMトークンを登録しました" }, status: :created
      else
        render json: { error: fcm_token.errors.full_messages.join(", ") }, status: :unprocessable_entity
      end
    end
  end

  # DELETE /v1/user/fcm_tokens
  def destroy
    token = params[:token]
    if token.present?
      current_user.fcm_tokens.where(token: token).destroy_all
    else
      current_user.fcm_tokens.destroy_all
    end
    render json: { message: "FCMトークンを削除しました" }, status: :ok
  end
end
