class V1::StaffsController < ApplicationController
  before_action :authenticate_user!, only: %i[create update destroy]
  before_action :validate_shop_id, only: %i[create]

  def index
    staffs = shop_id.present? ? Staff.where(shop_id: shop_id) : Staff.all
    render json: { staffs: staffs.sort_by { |s| s.name.to_s } }
  end

  def show
    render json: staff
  end

  def upcoming_shifts
    now = Time.current.beginning_of_day
    shifts = StaffShift
      .where(staff_id: params[:id])
      .where("start_at >= ?", now)
      .includes(staff: :shop)
      .order(:start_at)
      .limit(30)

    result = shifts.map do |shift|
      {
        id: shift.id,
        staff_id: shift.staff_id,
        shop_id: shift.shop_id,
        start_at: shift.start_at.iso8601,
        end_at: shift.end_at.iso8601,
        _shop_id: shift.shop_id,
        _shop_name: shift.staff&.shop&.name
      }
    end

    render json: { staff_shifts: result }, status: :ok
  end

  def monthly_shifts
    year = params[:year].to_i
    month = params[:month].to_i
    begin
      start_date = Time.zone.local(year, month, 1).beginning_of_day
      end_date = start_date.end_of_month.end_of_day
    rescue ArgumentError
      return render json: { error: "invalid year/month" }, status: :bad_request
    end

    shifts = StaffShift
      .where(staff_id: params[:id])
      .where("start_at <= ? AND end_at >= ?", end_date, start_date)
      .order(:start_at)

    result = shifts.map do |shift|
      {
        id: shift.id,
        staff_id: shift.staff_id,
        shop_id: shift.shop_id,
        start_at: shift.start_at.iso8601,
        end_at: shift.end_at.iso8601
      }
    end

    render json: { staff_shifts: result }, status: :ok
  end

  def create
    pp staff_params
    new_staff = Staff.new(staff_params)
    if new_staff.save
      render json: new_staff, status: :created
    else
      render json: { errors: new_staff.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    before_data = staff.as_json
    if staff.update(staff_params)
      ActionLogger.log(user: current_user, action_type: "update", target: staff, detail: before_data)
      render json: staff
    else
      render json: { errors: staff.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    if staff
      ActionLogger.log(user: current_user, action_type: "destroy", target: staff, detail: staff.as_json)
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
