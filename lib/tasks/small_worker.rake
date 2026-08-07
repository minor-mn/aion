namespace :aion do
  desc "Run periodic imports, notifications, and cleanup"
  task small_worker: :environment do
    puts SmallWorker.call.to_json
  end
end
