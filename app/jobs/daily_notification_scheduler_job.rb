class DailyNotificationSchedulerJob < ApplicationJob
  queue_as :default

  def perform
    ShiftNotificationScanner.call
  end
end
