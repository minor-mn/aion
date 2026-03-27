# frozen_string_literal: true

class Users::RegistrationsController < Devise::RegistrationsController
  MAIL_DELIVERY_ERRORS = [
    Errno::ECONNREFUSED,
    IOError,
    Net::OpenTimeout,
    Net::ReadTimeout,
    Net::SMTPAuthenticationError,
    Net::SMTPFatalError,
    Net::SMTPServerBusy,
    Net::SMTPSyntaxError,
    SocketError
  ].freeze

  respond_to :json

  def create
    build_resource(sign_up_params)

    Rails.logger.info(
      "[Registrations] Create start email=#{masked_email(sign_up_params[:email])} " \
      "confirmable=#{resource.class.devise_modules.include?(:confirmable)}"
    )

    resource.save

    Rails.logger.info(
      "[Registrations] Save result persisted=#{resource.persisted?} " \
      "active_for_authentication=#{resource.persisted? ? resource.active_for_authentication? : false} " \
      "errors=#{resource.errors.full_messages.join(', ')}"
    )

    if resource.persisted?
      if resource.active_for_authentication?
        render json: { message: "Registered.", user: resource.as_json(only: %i[id email nickname role]) }, status: :ok
      else
        render json: { message: "確認メールを #{resource.email} に送信しました。メール内のリンクをクリックして登録を完了してください。" }, status: :ok
      end
    else
      # If email is already taken, check if the existing user is unconfirmed
      # and resend the confirmation email instead of showing an error.
      existing = User.find_by(email: sign_up_params[:email])
      if existing && !existing.confirmed?
        Rails.logger.info("[Registrations] Existing unconfirmed user found, resending confirmation email")
        existing.resend_confirmation_instructions
        render json: { message: "このメールアドレスは登録済みですが未確認です。確認メールを再送しました。" }, status: :ok
      else
        render json: { message: "登録に失敗しました。", errors: resource.errors.full_messages }, status: :unprocessable_entity
      end
    end
  rescue *MAIL_DELIVERY_ERRORS => e
    Rails.logger.error("[Registrations] Mail delivery failed: #{e.class}: #{e.message}")
    render json: {
      message: "確認メールの送信に失敗しました。メール設定を確認して再度お試しください。",
      error: e.message
    }, status: :service_unavailable
  rescue StandardError => e
    Rails.logger.error("[Registrations] Create failed: #{e.class}: #{e.message}")
    raise
  end

  def update
    if resource.valid_password?(params[:current_password])
      if resource.update(account_update_params.except(:current_password))
        render json: { message: "Updated.", user: resource.as_json(only: %i[id email nickname role]) }, status: :ok
      else
        render json: { message: "Update failed.", errors: resource.errors.full_messages }, status: :unprocessable_entity
      end
    else
      render json: { message: "Current password is incorrect." }, status: :unauthorized
    end
  end

  private

  def sign_up_params
    registration_params.permit(:email, :password, :password_confirmation)
  end

  def account_update_params
    registration_params.permit(:email, :password, :password_confirmation, :current_password)
  end

  def registration_params
    params[:registration].presence || params
  end

  def masked_email(value)
    return "(none)" if value.blank?

    local, domain = value.split("@", 2)
    masked_local = local.to_s[0, 2].to_s
    masked_domain = domain.present? ? "@#{domain}" : ""
    "#{masked_local}***#{masked_domain}"
  end

  def respond_to_on_destroy
    head :no_content
  end
end
