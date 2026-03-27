class V1::ShopsController < ApplicationController
  before_action :authenticate_user!, except: %i[index show monthly_shifts]
  before_action :authorize_shop_management!, only: %i[update destroy]

  def index
    render json: { shops: Shop.all.sort_by { |s| s.name.to_s } }
  end

  def show
    render json: shop
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
      .where(shop_id: shop.id)
      .where(start_at: start_date..end_date)
      .includes(:staff)
      .order(:start_at)

    days = shifts.group_by { |shift| shift.start_at.in_time_zone.to_date }.map do |date, grouped_shifts|
      earliest_start = grouped_shifts.min_by(&:start_at).start_at.in_time_zone
      latest_end = grouped_shifts.max_by(&:end_at).end_at.in_time_zone

      {
        date: date.iso8601,
        start_at: earliest_start.iso8601,
        end_at: latest_end.iso8601,
        label: "#{earliest_start.strftime('%H:%M')}\n#{latest_end.strftime('%H:%M')}"
      }
    end.sort_by { |day| day[:date] }

    events = Event
      .where(shop_id: shop.id)
      .where("start_at <= ? AND end_at >= ?", end_date, start_date)
      .order(:start_at)
      .map do |event|
        {
          id: event.id,
          user_id: event.user_id,
          title: event.title,
          url: event.url,
          start_at: event.start_at.iso8601,
          end_at: event.end_at.iso8601
        }
      end

    render json: { days: days, events: events }, status: :ok
  end

  def create
    new_shop = Shop.new(shop_params)
    new_shop.user = current_user
    if new_shop.save
      render json: new_shop, status: :created
    else
      render json: { errors: new_shop.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    before_data = shop.as_json
    if shop.update(shop_params)
      ActionLogger.log(user: current_user, action_type: "update", target: shop, detail: before_data)
      render json: shop
    else
      render json: { errors: shop.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    if shop
      ActionLogger.log(user: current_user, action_type: "destroy", target: shop, detail: shop.as_json)
      shop.destroy
      head :no_content
    else
      head :not_found
    end
  end

  private

  def shop
    @shop ||= Shop.find(params[:id])
  end

  def shop_params
    params.permit(:name, :address, :latitude, :longitude, :site_url, :image_url)
  end

  def authorize_shop_management!
    return unless shop

    authorize_owner_or_operator_or_admin!(shop)
  end
end
