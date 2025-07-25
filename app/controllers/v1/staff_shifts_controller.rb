class V1::StaffShiftsController < ApplicationController
  before_action :authenticate_user!, only: %i[create update destroy]
  before_action :require_shop_id, only: %i[index show create update destroy]
  before_action :set_staff_shift, only: %i[show update destroy]

  def index
    render json: { staff_shifts: StaffShift.where(shop_id: params[:shop_id]) }
  end

  def show
    render json: { staff_shift: staff_shift }
  end

  def create
    shift = StaffShift.new(staff_shift_params)
    shift.shop_id = params[:shop_id]
    if shift.save
      ActionLogger.log(user: current_user, action_type: "create", target: shift)
      render json: { staff_shift: shift }, status: :created
    else
      render json: { errors: shift.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    if staff_shift.update(staff_shift_params)
      ActionLogger.log(user: current_user, action_type: "update", target: staff_shift)
      render json: { staff_shift: staff_shift }
    else
      render json: { errors: staff_shift.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    if staff_shift
      ActionLogger.log(user: current_user, action_type: "destroy", target: staff_shift)
      staff_shift.destroy
      head :no_content
    else
      head :not_found
    end
  end

  private

  def require_shop_id
    render json: { error: "shop_id is required" }, status: :bad_request if params[:shop_id].blank?
  end

  def set_staff_shift
    @staff_shift ||= StaffShift.find_by(id: params[:id], shop_id: params[:shop_id])
    render json: { error: "Not Found" }, status: :not_found unless @staff_shift
  end

  def staff_shift
    @staff_shift
  end

  def staff_shift_params
    params.permit(:staff_id, :start_at, :end_at)
  end
end
