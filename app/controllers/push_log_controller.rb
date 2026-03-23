class PushLogController < ApplicationController
  def create
    Rails.logger.info("[PushLog] SW received push event: #{params[:status]} | #{params[:title]} | #{params[:body]}")
    render json: { ok: true }
  end
end
