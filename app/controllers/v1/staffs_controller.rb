class V1::StaffsController < ApplicationController
  include Paginatable

  before_action :authenticate_user!, only: %i[create update destroy]
  before_action :validate_shop_id, only: %i[create]
  before_action :authorize_staff_management!, only: %i[update destroy]

  def index
    staffs = shop_id.present? ? Staff.where(shop_id: shop_id) : Staff.all
    render json: { staffs: staffs.order(:name) }
  end

  def show
    render json: staff.as_json.merge(shop_name: staff.shop&.name)
  end

  def upcoming_shifts
    now = Time.current.beginning_of_day
    shifts = StaffShift
      .where(staff_id: params[:id])
      .where("start_at >= ?", now)
      .includes(staff: :shop)
      .order(:start_at)
      .limit(pagination_limit)
      .offset(pagination_offset)

    result = shifts.map do |shift|
      {
        id: shift.id,
        staff_id: shift.staff_id,
        user_id: shift.user_id,
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

    staff = Staff.find(params[:id])
    events = Event
      .where(shop_id: staff.shop_id)
      .where("start_at <= ? AND end_at >= ?", end_date, start_date)
      .order(:start_at)

    events_result = events.map do |event|
      {
        id: event.id,
        user_id: event.user_id,
        title: event.title,
        start_at: event.start_at.iso8601,
        end_at: event.end_at.iso8601
      }
    end

    render json: { staff_shifts: result, events: events_result }, status: :ok
  end

  def create
    new_staff = Staff.new(staff_params)
    new_staff.user = current_user
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
    params[:shop_id]
  end

  def staff
    @staff ||= Staff.find(params[:id])
  end

  def staff_params
    params.permit(:name, :shop_id, :image_url, :site_url)
  end

  def authorize_staff_management!
    return unless staff

    authorize_owner_or_operator_or_admin!(staff)
  end
end
