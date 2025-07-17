Rails.application.routes.draw do
  # devise
  devise_for :users,
    defaults: { format: :json },
    controllers: {
      sessions: "users/sessions",
      registrations: "users/registrations"
    }

  # user
  namespace :user do
    get "me", to: "me#show"
  end

  # shops
  resources :shops, only: [ :index, :create, :show, :update, :destroy ] do
    resources :staffs, only: [ :index, :create, :show, :update, :destroy ]
    resources :staff_shifts, only: [ :index, :create, :show, :update, :destroy ]
  end
end
