# frozen_string_literal: true

class Users::PasswordsController < Devise::PasswordsController
  respond_to :json

  # POST /users/password — send reset email
  def create
    self.resource = resource_class.send_reset_password_instructions(resource_params)

    if successfully_sent?(resource)
      render json: { message: "パスワード再設定メールを送信しました。メール内のリンクをクリックしてください。" }, status: :ok
    else
      render json: { errors: resource.errors.full_messages }, status: :unprocessable_entity
    end
  end

  # GET /users/password/edit?reset_password_token=xxx — redirect to SPA
  def edit
    redirect_to "/?reset_password_token=#{params[:reset_password_token]}", allow_other_host: false
  end

  # PUT /users/password — reset password with token
  def update
    self.resource = resource_class.reset_password_by_token(resource_params)

    if resource.errors.empty?
      render json: { message: "パスワードを再設定しました。新しいパスワードでログインしてください。" }, status: :ok
    else
      render json: { errors: resource.errors.full_messages }, status: :unprocessable_entity
    end
  end

  private

  def resource_params
    params.permit(:email, :password, :password_confirmation, :reset_password_token)
  end
end
