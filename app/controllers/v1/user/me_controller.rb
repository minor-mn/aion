class V1::User::MeController < ApplicationController
  before_action :authenticate_user!

  def show
    render json: { user: current_user.as_json(only: %i[id email nickname]) }
  end
end
