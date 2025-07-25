class V1::StaffPreferencesController < ApplicationController
  before_action :authenticate_user!
  before_action :set_preference, only: %i[update destroy]

  def index
    preferences = current_user.staff_preferences.includes(:staff)
    render json: { staff_preferences: preferences }
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

  def update
    if @preference.update(score: params[:score])
      ActionLogger.log(user: current_user, action_type: "update", target: @preference)
      render json: { staff_preference: @preference }
    else
      render json: { errors: @preference.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    ActionLogger.log(user: current_user, action_type: "destroy", target: @preference)
    @preference.destroy
    head :no_content
  end

  private

  def preference_params
    params.permit(:staff_id, :score)
  end

  def set_preference
    @preference = current_user.staff_preferences.find_by(staff_id: params[:id])
    render json: { error: "Not Found" }, status: :not_found unless @preference
  end
end
