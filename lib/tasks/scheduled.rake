namespace :aion do
  desc "Import shifts from X timelines"
  task import_shifts: :environment do
    puts ImportShiftsFromXListJob.perform_now.to_json
  end

  desc "Send shift start notifications"
  task shift_notifications: :environment do
    puts ShiftNotificationScanner.call.to_json
  end

  desc "Delete expired transient records"
  task cleanup: :environment do
    CleanupTransientRecordsJob.perform_now
  end
end
