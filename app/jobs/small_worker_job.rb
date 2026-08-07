class SmallWorkerJob < ApplicationJob
  queue_as :default

  def perform
    SmallWorker.call
  end
end
