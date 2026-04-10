class V1::SchedulesController < ApplicationController
  before_action :authenticate_user_if_present!

  def index
    service = Schedules::SummaryService.new(
      user: current_user,
      datetime_begin: params[:datetime_begin],
      datetime_end: params[:datetime_end]
    )
    days = service.call
    render json: { days: days }, status: :ok
  rescue ArgumentError
    render json: { error: "Invalid date format" }, status: :bad_request
  end

  def today
    service = Schedules::TodayService.new(user: current_user)
    shops = service.call
    render json: { shops: shops }, status: :ok
  end

  def now
    service = Schedules::NowService.new(user: current_user)
    shops = service.call
    render json: { shops: shops }, status: :ok
  end
end
