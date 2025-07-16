class ApplicationController < ActionController::API
  include ActionController::MimeResponds

  rescue_from ActionDispatch::Request::Session::DisabledSessionError do
    render json: { error: "Session disabled. Use token-based authentication." }, status: :unauthorized
  end
end
