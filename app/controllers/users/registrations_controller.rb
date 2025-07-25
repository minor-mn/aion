# frozen_string_literal: true

class Users::RegistrationsController < Devise::RegistrationsController
  respond_to :json

  def create
    build_resource(sign_up_params)

    resource.save
    if resource.persisted?
      render json: { message: "Registered.", user: resource }, status: :ok
    else
      render json: { message: "Registration failed.", errors: resource.errors.full_messages }, status: :unprocessable_entity
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

