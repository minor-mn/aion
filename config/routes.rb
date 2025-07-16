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

end
