class StaffPreferencesController < ApplicationController
  before_action :authenticate_user!

  def index
    begin
      date = params[:date].present? ? Date.parse(params[:date]) : Date.current
    rescue ArgumentError
      render json: { error: "Invalid date format" }, status: :bad_request and return
    end

    shifts = current_user.staff_preferences.shifts_by_date(current_user, date)
    render json: { staff_shifts: shifts }
  end

  def create
    preference = current_user.staff_preferences.find_or_initialize_by(staff_id: preference_params[:staff_id])
    preference.score = preference_params[:score]

    if preference.save
      ActionLogger.log(user: current_user, action_type: "create_or_update", target: preference)
      render json: { staff_preference: preference }, status: :created
    else
      render json: { errors: preference.errors.full_messages }, status: :unprocessable_entity
    end
  end

  private

  def preference_params
    params.require(:staff_preference).permit(:staff_id, :score)
  end
end
