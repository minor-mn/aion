class ApplicationController < ActionController::API
  include ActionController::MimeResponds

  rescue_from ParameterError do |e|
    render json: { error: e.message.presence || I18n.t("errors.parameter_invalid") }, status: :bad_request
  end

  rescue_from ActiveRecord::RecordNotFound do |e|
    render json: { error: I18n.t("errors.not_found") }, status: :not_found
  end

  rescue_from ActionController::ParameterMissing do |e|
    render json: { error: I18n.t("errors.parameter_missing") }, status: :bad_request
  end

  rescue_from ActiveRecord::RecordInvalid do |e|
    render json: { error: e.record.errors.full_messages }, status: :unprocessable_entity
  end

  rescue_from ActiveRecord::RecordNotUnique do
    render json: { error: I18n.t("errors.record_not_unique") }, status: :unprocessable_entity
  end

  rescue_from ActiveRecord::NotNullViolation do
    render json: { error: I18n.t("errors.not_null_violation") }, status: :unprocessable_entity
  end

  private

  def authenticate_user_if_present!
    return if request.headers["Authorization"].blank?

    authenticate_user!
  end

  def require_operator!
    return if current_user&.operator_or_admin?

    render json: { error: I18n.t("errors.forbidden") }, status: :forbidden
  end

  def require_admin!
    return if current_user&.admin?

    render json: { error: I18n.t("errors.forbidden") }, status: :forbidden
  end

  def authorize_owner_or_operator_or_admin!(record)
    return if current_user&.admin? || current_user&.operator?
    return if record.user_id.present? && record.user_id == current_user&.id

    render json: { error: I18n.t("errors.forbidden") }, status: :forbidden
  end
end
