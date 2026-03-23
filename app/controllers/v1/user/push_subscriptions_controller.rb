class V1::User::PushSubscriptionsController < ApplicationController
  before_action :authenticate_user!

  # POST /v1/user/push_subscriptions
  def create
    endpoint = params[:endpoint]
    p256dh = params[:p256dh]
    auth = params[:auth]

    if endpoint.blank? || p256dh.blank? || auth.blank?
      return render json: { error: "endpoint, p256dh, auth are required" }, status: :unprocessable_entity
    end

    existing = PushSubscription.find_by(endpoint: endpoint)
    if existing
      existing.update(user: current_user, p256dh: p256dh, auth: auth)
      render json: { message: "Push subscriptionを更新しました" }, status: :ok
    else
      sub = current_user.push_subscriptions.build(endpoint: endpoint, p256dh: p256dh, auth: auth)
      if sub.save
        render json: { message: "Push subscriptionを登録しました" }, status: :created
      else
        render json: { error: sub.errors.full_messages.join(", ") }, status: :unprocessable_entity
      end
    end
  end

  # DELETE /v1/user/push_subscriptions
  def destroy
    current_user.push_subscriptions.destroy_all
    render json: { message: "Push subscriptionを削除しました" }, status: :ok
  end
end
