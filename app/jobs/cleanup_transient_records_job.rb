class CleanupTransientRecordsJob < ApplicationJob
  queue_as :default

  def perform
    Rails.application.eager_load!

    cleanup_targets.each do |model|
      cutoff = Time.current - model.cleanup_before
      model.where(updated_at: ..cutoff).delete_all
    end
  end

  private

  def cleanup_targets
    ApplicationRecord.descendants.select do |model|
      model.table_exists? && model.cleanup_before != 0
    end
  end
end
