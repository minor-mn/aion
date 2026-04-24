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
      resource :notification_settings, only: %i[show update] do
        post :test, on: :collection
      end
      resources :push_subscriptions, only: %i[create]
      delete "push_subscriptions", to: "push_subscriptions#destroy"
    end

    # shops
    resources :shops, only: %i[index create show update destroy] do
      member do
        get :monthly_shifts
      end
    end

    # staffs
    resources :staffs, only: %i[index create show update destroy] do
      member do
        get :upcoming_shifts
        get :monthly_shifts
        get :recent_posts
      end
    end

    # staff_shifts
    resources :shops do
      resources :staff_shifts, only: %i[index create show update destroy] do
        collection do
          post :bulk_create
        end
      end
    end

    # preferences
    resources :staff_preferences, only: %i[index create show update destroy ]

    resources :shift_import_candidates, only: %i[index destroy] do
      collection do
        post :import_from_x
      end

      member do
        patch :approve
      end
    end

    # schedules
    resources :schedules, only: %i[index] do
      collection do
        get :today
        get :now
      end
    end

    # events
    resources :events, only: %i[index create show update destroy] do
      collection do
        post :parse_from_url
      end
    end

    # action_logs
    resources :action_logs, only: %i[index]

    # users
    resources :users, only: %i[index update destroy]

    # config
    get "config", to: "config#show"

    # check-ins
    resources :check_ins, only: %i[create] do
      collection do
        get :current
      end
      member do
        patch :check_out
        post :staff_rates, to: "check_ins#create_staff_rates"
      end
    end
  end
end
