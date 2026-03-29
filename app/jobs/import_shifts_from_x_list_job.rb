class ImportShiftsFromXListJob < ApplicationJob
  queue_as :default

  def perform
    TwitterStreamLogger.info("job_start #{self.class.name}")
    ShiftImports::ImportFromXList.new.call
  ensure
    TwitterStreamLogger.info("job_finish #{self.class.name}")
  end
end
