class V1::CheckInsController < ApplicationController
  before_action :authenticate_user!
  before_action :set_check_in, only: %i[check_out create_staff_rates]

  def create
    shop = Shop.find(params[:shop_id])

    if shop.latitude.nil? || shop.longitude.nil?
      return render json: { error: "この店舗は位置情報が未設定のためチェックインできません" }, status: :unprocessable_entity
    end

    lat = params[:latitude]
    lng = params[:longitude]
    if lat.blank? || lng.blank?
      return render json: { error: "現在地を取得できませんでした" }, status: :bad_request
    end

    distance = GeoDistance.meters_between(shop.latitude, shop.longitude, lat.to_f, lng.to_f)
    unless distance <= GeoDistance.limit_meters
      return render json: { error: "店舗から離れすぎているためチェックインできません (#{distance.round}m)" }, status: :unprocessable_entity
    end

    if current_user.check_ins.active.exists?
      return render json: { error: "既に他の店舗にチェックイン中です" }, status: :unprocessable_entity
    end

    check_in = current_user.check_ins.create!(
      shop: shop,
      checked_in_at: Time.current
    )
    render json: { check_in: serialize_check_in(check_in) }, status: :created
  end

  def current
    check_in = current_user.check_ins.active.order(checked_in_at: :desc).first
    if check_in
      render json: { check_in: serialize_check_in(check_in) }
    else
      render json: { check_in: nil }
    end
  end

  def check_out
    if @check_in.checked_out_at.present?
      return render json: { error: "このチェックインは既にチェックアウト済みです" }, status: :unprocessable_entity
    end

    @check_in.update!(checked_out_at: Time.current)

    staffs = @check_in.candidate_staffs
    render json: {
      check_in: serialize_check_in(@check_in),
      staffs: staffs.map { |s| { id: s.id, name: s.name, image_url: s.image_url } }
    }
  end

  def create_staff_rates
    unless @check_in.checked_out_at.present?
      return render json: { error: "チェックアウトされていないチェックインには評価できません" }, status: :unprocessable_entity
    end

    rates_params = params.require(:staff_rates)
    unless rates_params.is_a?(Array) || rates_params.respond_to?(:each)
      return render json: { error: "staff_rates は配列で指定してください" }, status: :bad_request
    end

    day_start = @check_in.checked_in_at.beginning_of_day
    day_end = @check_in.checked_in_at.end_of_day
    already_rated_staff_ids = StaffRate
      .joins(:check_in)
      .where(staff_id: rates_params.map { |r| (r.respond_to?(:permit) ? r : ActionController::Parameters.new(r))[:staff_id] }.compact)
      .where(check_ins: { user_id: current_user.id, checked_in_at: day_start..day_end })
      .where.not(check_in_id: @check_in.id)
      .pluck(:staff_id)
      .map(&:to_i)
      .to_set

    created = []
    skipped = []
    ActiveRecord::Base.transaction do
      rates_params.each do |raw|
        attrs = raw.respond_to?(:permit) ? raw.permit(:staff_id, :overall_rate, :appearance_rate, :service_rate, :mood_rate) : raw
        staff_id = attrs[:staff_id].to_i
        if already_rated_staff_ids.include?(staff_id)
          skipped << staff_id
          next
        end
        rate = @check_in.staff_rates.create!(
          staff_id: staff_id,
          overall_rate: attrs[:overall_rate],
          appearance_rate: attrs[:appearance_rate],
          service_rate: attrs[:service_rate],
          mood_rate: attrs[:mood_rate]
        )
        created << rate
      end
    end

    render json: {
      staff_rates: created.map { |r| serialize_staff_rate(r) },
      skipped_staff_ids: skipped
    }, status: :created
  end

  private

  def set_check_in
    @check_in = current_user.check_ins.find(params[:id])
  end

  def serialize_check_in(check_in)
    {
      id: check_in.id,
      shop_id: check_in.shop_id,
      shop_name: check_in.shop&.name,
      checked_in_at: check_in.checked_in_at,
      checked_out_at: check_in.checked_out_at
    }
  end

  def serialize_staff_rate(rate)
    {
      id: rate.id,
      check_in_id: rate.check_in_id,
      staff_id: rate.staff_id,
      overall_rate: rate.overall_rate,
      appearance_rate: rate.appearance_rate,
      service_rate: rate.service_rate,
      mood_rate: rate.mood_rate
    }
  end
end
