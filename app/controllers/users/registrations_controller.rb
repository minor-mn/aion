# frozen_string_literal: true

class Users::RegistrationsController < Devise::RegistrationsController
  respond_to :json

  def create
    build_resource(sign_up_params)

    resource.save
    if resource.persisted?
      if resource.active_for_authentication?
        render json: { message: "Registered.", user: resource }, status: :ok
      else
        render json: { message: "確認メールを #{resource.email} に送信しました。メール内のリンクをクリックして登録を完了してください。" }, status: :ok
      end
    else
      # If email is already taken, check if the existing user is unconfirmed
      # and resend the confirmation email instead of showing an error.
      existing = User.find_by(email: sign_up_params[:email])
      if existing && !existing.confirmed?
        existing.resend_confirmation_instructions
        render json: { message: "このメールアドレスは登録済みですが未確認です。確認メールを再送しました。" }, status: :ok
      else
        render json: { message: "登録に失敗しました。", errors: resource.errors.full_messages }, status: :unprocessable_entity
      end
    end
  end

  def update
    if resource.valid_password?(params[:current_password])
      if resource.update(account_update_params.except(:current_password))
        render json: { message: "Updated.", user: resource }, status: :ok
      else
        render json: { message: "Update failed.", errors: resource.errors.full_messages }, status: :unprocessable_entity
      end
    else
      render json: { message: "Current password is incorrect." }, status: :unauthorized
    end
  end

  private

  def sign_up_params
    params.permit(:email, :password, :password_confirmation)
  end

  def account_update_params
    params.permit(:email, :password, :password_confirmation, :current_password)
  end

  def respond_to_on_destroy
    head :no_content
  end
end
