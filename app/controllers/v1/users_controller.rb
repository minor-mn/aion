class V1::UsersController < ApplicationController
  include Paginatable

  before_action :authenticate_user!
  before_action :require_admin!
  before_action :set_user, only: %i[update destroy]

  def index
    users = User.order(id: :desc).limit(pagination_limit).offset(pagination_offset)
    render json: {
      users: users.as_json(only: %i[id email nickname role confirmed_at created_at updated_at])
    }, status: :ok
  end

  def update
    if @user.update(user_params)
      render json: {
        user: @user.as_json(only: %i[id email nickname role confirmed_at created_at updated_at])
      }, status: :ok
    else
      render json: { errors: @user.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    if @user.id == current_user.id
      return render json: { error: I18n.t("errors.cannot_delete_self") }, status: :unprocessable_entity
    end

    if @user.admin? && User.admin.count == 1
      return render json: { error: I18n.t("errors.cannot_delete_last_admin") }, status: :unprocessable_entity
    end

    @user.destroy
    head :no_content
  end

  private

  def set_user
    @user = User.find(params[:id])
  end

  def user_params
    params.permit(:nickname, :role)
  end
end
