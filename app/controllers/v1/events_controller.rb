class V1::EventsController < ApplicationController
  include Paginatable

  before_action :authenticate_user!, only: %i[create update destroy]
  before_action :set_event, only: %i[show update destroy]
  before_action :authorize_event_management!, only: %i[update destroy]

  def index
    events = Event.includes(:shop).order(:start_at)
    events = events.where(shop_id: params[:shop_id]) if params[:shop_id].present?
    events = events.where("end_at >= ?", Time.current) if future_only?
    events = events.limit(pagination_limit).offset(pagination_offset)
    render json: { events: events.as_json(include: { shop: { only: %i[id name user_id] } }) }
  end

  def show
    render json: { event: @event.as_json(include: { shop: { only: %i[id name user_id] } }) }
  end

  def create
    event = Event.new(event_params)
    event.user = current_user
    if event.save
      render json: { event: event.as_json(include: { shop: { only: %i[id name user_id] } }) }, status: :created
    else
      render json: { errors: event.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    if @event.update(event_params)
      render json: { event: @event.as_json(include: { shop: { only: %i[id name user_id] } }) }
    else
      render json: { errors: @event.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    @event.destroy
    head :no_content
  end

  private

  def set_event
    @event = Event.find_by(id: params[:id])
    render json: { error: "Not Found" }, status: :not_found unless @event
  end

  def event_params
    params.require(:event).permit(:shop_id, :title, :url, :start_at, :end_at)
  end

  def future_only?
    ActiveModel::Type::Boolean.new.cast(params[:future_only])
  end

  def authorize_event_management!
    return unless @event

    authorize_owner_or_operator_or_admin!(@event)
  end
end
