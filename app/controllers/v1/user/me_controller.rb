class V1::User::MeController < ApplicationController
  before_action :authenticate_user!

  def show
    render json: { user: current_user }
  end
end
