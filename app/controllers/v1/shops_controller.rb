class V1::ShopsController < ApplicationController
  before_action :authenticate_user!, except: %i[index show]

  def index
    render json: { shops: Shop.all }
  end

  def show
    render json: shop
  end

  def create
    new_shop = Shop.new(shop_params)
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
    params.permit(:name, :latitude, :longitude, :site_url, :image_url)
  end
end
