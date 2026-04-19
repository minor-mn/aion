class V1::ConfigController < ApplicationController
  def show
    render json: {
      limit_meters: GeoDistance.limit_meters
    }
  end
end
