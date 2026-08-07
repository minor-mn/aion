class SmallWorker
  CLEANUP_HOUR_INTERVAL = 4

  def self.call(now: Time.current)
    new(now: now).call
  end

  def initialize(now: Time.current)
    @now = now.in_time_zone
  end

  def call
    results = {}
    errors = []

    run_task(:import_shifts_from_x, results, errors) { ImportShiftsFromXListJob.perform_now }
    run_task(:shift_notifications, results, errors) { ShiftNotificationScanner.call(now: now) }
    run_task(:cleanup_transient_records, results, errors) { CleanupTransientRecordsJob.perform_now } if cleanup_slot?

    raise "SmallWorker failed: #{errors.join(', ')}" if errors.any?

    results
  end

  private

  attr_reader :now

  def cleanup_slot?
    now.min < 30 && (now.hour % CLEANUP_HOUR_INTERVAL).zero?
  end

  def run_task(name, results, errors)
    Rails.logger.info("[SmallWorker] #{name} start")
    results[name] = yield
    Rails.logger.info("[SmallWorker] #{name} finish")
  rescue => e
    Rails.logger.error("[SmallWorker] #{name} failed: #{e.class} - #{e.message}")
    errors << "#{name}=#{e.class}"
  end
end
