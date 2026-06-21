class V1::SchedulesController < ApplicationController
  before_action :authenticate_user_if_present!

  def index
    service = Schedules::SummaryService.new(
      user: current_user,
      datetime_begin: params[:datetime_begin],
      datetime_end: params[:datetime_end],
      shop_id: params[:shop_id]
    )
    days = service.call
    set_server_data_updated_at_header
    render json: { days: days }, status: :ok
  rescue ArgumentError
    render json: { error: "Invalid date format" }, status: :bad_request
  end

  def today
    service = Schedules::TodayService.new(user: current_user, shop_id: params[:shop_id])
    shops = service.call
    render json: { shops: shops }, status: :ok
  end

  def now
    service = Schedules::NowService.new(user: current_user, shop_id: params[:shop_id])
    shops = service.call
    render json: { shops: shops }, status: :ok
  end

  private

  def set_server_data_updated_at_header
    updated_at = current_user_server_data_updated_at
    response.set_header("X-Server-Data-Updated-At", updated_at) if updated_at
  end
end
