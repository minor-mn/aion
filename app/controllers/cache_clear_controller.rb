class CacheClearController < ApplicationController
  def show
    response.headers["Clear-Site-Data"] = '"cache", "storage"'
    redirect_to root_path, allow_other_host: true
  end
end
