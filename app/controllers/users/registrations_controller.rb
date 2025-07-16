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

  private

  def respond_to_on_destroy
    head :no_content
  end
end

