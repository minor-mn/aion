class ScheduleShiftNotificationsJob < ApplicationJob
  queue_as :default

  def perform(_shift_id = nil)
    ShiftNotificationScanner.call
  end
end
