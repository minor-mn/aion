class V1::User::FcmTokensController < ApplicationController
  before_action :authenticate_user!

  # POST /v1/user/fcm_tokens
  def create
    token = params[:token]
    return render json: { error: "token is required" }, status: :unprocessable_entity if token.blank?

    # If the token already exists for another user, reassign it
    existing = FcmToken.find_by(token: token)
    if existing
      existing.update!(user: current_user)
      render json: { message: "FCMトークンを更新しました" }, status: :ok
    else
      current_user.fcm_tokens.create!(token: token)
      render json: { message: "FCMトークンを登録しました" }, status: :created
    end
  end

  # DELETE /v1/user/fcm_tokens
  def destroy
    token = params[:token]
    current_user.fcm_tokens.where(token: token).destroy_all
    render json: { message: "FCMトークンを削除しました" }, status: :ok
  end
end
