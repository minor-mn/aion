Rails.application.routes.draw do
  # Clear browser cache/SW — visit once to force fresh reload
  get "clear_cache", to: "cache_clear#show"

  devise_for :users,
    defaults: { format: :json },
    controllers: {
      sessions: "users/sessions",
      registrations: "users/registrations",
      confirmations: "users/confirmations"
    }

  namespace :v1, defaults: { format: :json } do
    # user
    namespace :user do
      get "me", to: "me#show"
      patch "profile", to: "profile#update"
      resource :notification_settings, only: %i[show update]
      resources :push_subscriptions, only: %i[create]
      delete "push_subscriptions", to: "push_subscriptions#destroy"
    end

    # shops
    resources :shops, only: %i[index create show update destroy]

    # staffs
    resources :staffs, only: %i[index create show update destroy]

    # staff_shifts
    resources :shops do
      resources :staff_shifts, only: %i[index create show update destroy]
    end

    # preferences
    resources :staff_preferences, only: %i[index create show update destroy ]

    # shedules
    resources :schedules, only: %i[index]

    # action_logs
    resources :action_logs, only: %i[index]
  end
end
