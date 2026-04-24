class V1::StaffsController < ApplicationController
  include Paginatable
  wrap_parameters false

  before_action :authenticate_user!, only: %i[create update destroy]
  before_action :authenticate_user_if_present!, only: %i[show]
  before_action :validate_shop_id, only: %i[create]
  before_action :authorize_staff_management!, only: %i[update destroy]

  def index
    staffs = shop_id.present? ? Staff.where(shop_id: shop_id) : Staff.all
    render json: { staffs: staffs.order(:name) }
  end

  def show
    json = staff.as_json.merge(shop_name: staff.shop&.name)
    if current_user
      tr = TotalRate.find_by(staff_id: staff.id, year: Time.current.year)
      json.merge!(
        overall_rate_total: tr&.total_overall_rate.to_i,
        appearance_rate_total: tr&.total_appearance_rate.to_i,
        service_rate_total: tr&.total_service_rate.to_i,
        mood_rate_total: tr&.total_mood_rate.to_i,
        check_in_count: tr&.check_in_count.to_i
      )
    end
    render json: json
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
        shop_name: shift.staff&.shop&.name
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
        user_id: shift.user_id,
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
        url: event.url,
        start_at: event.start_at.iso8601,
        end_at: event.end_at.iso8601
      }
    end

    render json: { staff_shifts: result, events: events_result }, status: :ok
  end

  def recent_posts
    size = params[:limit].to_i
    size = 3 if size <= 0
    size = 20 if size > 20

    distinct_latest = ShiftImportCandidate
      .where(staff_id: staff.id)
      .where.not(source_post_id: [ nil, "" ])
      .select("DISTINCT ON (source_post_id) shift_import_candidates.*")
      .order(Arel.sql("source_post_id, id DESC"))

    posts = ShiftImportCandidate
      .from("(#{distinct_latest.to_sql}) AS shift_import_candidates")
      .order(id: :desc)
      .limit(size)
      .map do |record|
        {
          source_post_id: record.source_post_id,
          source_post_url: record.source_post_url,
          source_posted_at: (record.source_posted_at || record.created_at)&.iso8601,
          source_username: record.source_username,
          raw_text: record.raw_text
        }
      end

    render json: { recent_posts: posts }, status: :ok
  end

  def create
    new_staff = Staff.new(staff_params)
    new_staff.user = current_user
    enrich_from_x_profile!(new_staff)
    if new_staff.save
      render json: new_staff, status: :created
    else
      render json: { errors: new_staff.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    before_data = staff.as_json
    staff.assign_attributes(staff_params)
    enrich_from_x_profile!(staff)
    if staff.save
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
    params.except(:id, :format, :controller, :action).permit(:name, :shop_id, :image_url, :site_url)
  end

  def authorize_staff_management!
    return unless staff

    authorize_owner_or_operator_or_admin!(staff)
  end

  def enrich_from_x_profile!(record)
    return unless record.name.blank? || record.image_url.blank?

    matcher = ShiftImports::CandidateMatcher.new
    username = matcher.username_from_site_url(record.site_url)
    return unless username.present?

    client = ShiftImports::XListClient.new
    data = client.fetch_user_by_username(username: username).dig("data")
    return if data.blank?

    record.name = data["name"] if record.name.blank? && data["name"].present?
    if record.image_url.blank? && data["profile_image_url"].present?
      record.image_url = data["profile_image_url"].sub("_normal.", ".")
    end
  rescue StandardError
    # X API failure — leave fields blank, model validation will handle name,
    # controller checks handle image_url
  end
end
