class V1::User::ProfileController < ApplicationController
  before_action :authenticate_user!

  # PATCH /v1/user/profile
  def update
    if params[:current_password].present?
      # Password or email change requires current password verification
      unless current_user.valid_password?(params[:current_password])
        return render json: { error: "現在のパスワードが正しくありません" }, status: :unauthorized
      end
    end

    if current_user.update(profile_params)
      new_token = Warden::JWTAuth::UserEncoder.new.call(current_user, :user, nil).first
      render json: { message: "プロフィールを更新しました", user: current_user.as_json(only: %i[id email nickname role]), token: new_token }, status: :ok
    else
      render json: { error: current_user.errors.full_messages.join(", ") }, status: :unprocessable_entity
    end
  end

  private

  def profile_params
    permitted = params.permit(:nickname)

    # Only allow email change with current_password
    if params[:current_password].present?
      permitted = params.permit(:nickname, :email, :password, :password_confirmation)
    end

    permitted
  end
end
