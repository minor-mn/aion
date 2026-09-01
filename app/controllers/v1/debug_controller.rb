require "fileutils"

class V1::DebugController < ApplicationController
  def create
    log_directory = Rails.root.join("log")
    FileUtils.mkdir_p(log_directory)

    filename = "#{Time.current.strftime("%Y%m%d%H%M%S")}.log"
    File.binwrite(log_directory.join(filename), request.raw_post)

    head :ok
  end
end
