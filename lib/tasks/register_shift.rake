# frozen_string_literal: true

require Rails.root.join("lib/interactive_shift_registration")

namespace :aion do
  desc "Interactively register shifts for an existing staff member"
  task register_shift: :environment do
    InteractiveShiftRegistration.new.run
  end
end
