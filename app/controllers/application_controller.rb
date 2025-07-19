class ApplicationController < ActionController::API
  include ActionController::MimeResponds

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
end
