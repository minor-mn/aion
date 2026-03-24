class V1::EventsController < ApplicationController
  before_action :authenticate_user!, only: %i[create update destroy]
  before_action :set_event, only: %i[show update destroy]

  def index
    events = Event.includes(:shop).order(:start_at)
    if params[:shop_id].present?
      events = events.where(shop_id: params[:shop_id])
    end
    render json: { events: events.as_json(include: { shop: { only: %i[id name] } }) }
  end

  def show
    render json: { event: @event.as_json(include: { shop: { only: %i[id name] } }) }
  end

  def create
    event = Event.new(event_params)
    if event.save
      render json: { event: event.as_json(include: { shop: { only: %i[id name] } }) }, status: :created
    else
      render json: { errors: event.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    if @event.update(event_params)
      render json: { event: @event.as_json(include: { shop: { only: %i[id name] } }) }
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
    params.permit(:shop_id, :title, :url, :start_at, :end_at)
  end
end
