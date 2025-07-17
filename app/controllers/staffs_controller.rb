class StaffsController < ApplicationController
  before_action :authenticate_user!, only: %i[create update destroy]
  before_action :validate_shop_id

  def index
    render json: { staffs: Staff.where(shop_id: shop_id) }
  end

  def show
    render json: staff
  end

  def create
    new_staff = Staff.new(staff_params.merge(shop_id: shop_id))
    if new_staff.save
      ActionLogger.log(user: current_user, action_type: "create", target: new_staff)
      render json: new_staff, status: :created
    else
      render json: { errors: new_staff.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    if staff.update(staff_params)
      ActionLogger.log(user: current_user, action_type: "update", target: staff)
      render json: staff
    else
      render json: { errors: staff.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    if staff
      ActionLogger.log(user: current_user, action_type: "destroy", target: staff)
      staff.destroy
      head :no_content
    else
      head :not_found
    end
  end

  private

  def validate_shop_id
    head :bad_request unless shop_id
  end

  def shop_id
    params[:shop_id]
  end

  def staff
    @staff ||= Staff.find(params[:id])
  end

  def staff_params
    params.require(:staff).permit(:name, :image_url, :site_url)
  end
end
