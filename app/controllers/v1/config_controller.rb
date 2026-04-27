class V1::ConfigController < ApplicationController
  def show
    render json: {
      limit_meters: GeoDistance.limit_meters,
      checked_in: serialize_check_in(current_check_in)
    }
  end

  private

  def current_check_in
    return nil unless current_user

    current_user.check_ins.active.order(checked_in_at: :desc).first
  end

  def serialize_check_in(check_in)
    return nil unless check_in

    {
      id: check_in.id,
      shop_id: check_in.shop_id,
      shop_name: check_in.shop&.name,
      checked_in_at: check_in.checked_in_at,
      checked_out_at: check_in.checked_out_at
    }
  end
end
