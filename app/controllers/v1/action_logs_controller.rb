class V1::ActionLogsController < ApplicationController
  before_action :authenticate_user!
  before_action :require_admin!

  def index
    logs = ActionLog.order(created_at: :desc).limit(100)
    logs = logs.where(shop_id: params[:shop_id]) if params[:shop_id].present?
    logs = logs.where(staff_id: params[:staff_id]) if params[:staff_id].present?
    logs = logs.where(target_type: params[:target_type]) if params[:target_type].present?

    render json: { action_logs: logs.as_json(include_user_email: true) }
  end
end
