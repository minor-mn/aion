Rails.application.routes.draw do
  devise_for :users,
    defaults: { format: :json },
    controllers: {
      sessions: "users/sessions",
      registrations: "users/registrations"
    }

  namespace :v1, defaults: { format: :json } do
    # user
    namespace :user do
      get "me", to: "me#show"
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
  end
end
