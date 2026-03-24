Rails.application.routes.draw do
  devise_for :users,
    defaults: { format: :json },
    controllers: {
      sessions: "users/sessions",
      registrations: "users/registrations",
      confirmations: "users/confirmations",
      passwords: "users/passwords"
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
    resources :staffs, only: %i[index create show update destroy] do
      member do
        get :upcoming_shifts
      end
    end

    # staff_shifts
    resources :shops do
      resources :staff_shifts, only: %i[index create show update destroy]
    end

    # preferences
    resources :staff_preferences, only: %i[index create show update destroy ]

    # schedules
    resources :schedules, only: %i[index] do
      collection do
        get :today
        get :now
      end
    end

    # events
    resources :events, only: %i[index create show update destroy]

    # action_logs
    resources :action_logs, only: %i[index]
  end
end
