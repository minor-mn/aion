class V1::StaffsController < ApplicationController
  before_action :authenticate_user!, only: %i[create update destroy]
  before_action :validate_shop_id, only: %i[create]

  def index
    staffs = shop_id.present? ? Staff.where(shop_id: shop_id) : Staff.all
    render json: { staffs: staffs }
  end

  def show
    render json: staff
  end

  def create
    pp staff_params
    new_staff = Staff.new(staff_params)
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
    staff_params[:shop_id]
  end

  def staff
    @staff ||= Staff.find(params[:id])
  end

  def staff_params
    params.permit(:name, :shop_id, :image_url, :site_url)
  end
end
