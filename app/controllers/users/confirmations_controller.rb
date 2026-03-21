# frozen_string_literal: true

class Users::ConfirmationsController < Devise::ConfirmationsController
  respond_to :json

  def show
    self.resource = resource_class.confirm_by_token(params[:confirmation_token])

    if resource.errors.empty?
      redirect_to "/?confirmed=true", allow_other_host: false
    else
      error_message = URI.encode_www_form_component(resource.errors.full_messages.join(", "))
      redirect_to "/?confirmation_error=#{error_message}", allow_other_host: false
    end
  end

  def create
    self.resource = resource_class.send_confirmation_instructions(resource_params)

    if successfully_sent?(resource)
      render json: { message: "Confirmation email has been resent." }, status: :ok
    else
      render json: { errors: resource.errors.full_messages }, status: :unprocessable_entity
    end
  end

  private

  def resource_params
    params.permit(:email)
  end
end
