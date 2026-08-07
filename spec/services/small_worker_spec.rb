require "rails_helper"

RSpec.describe SmallWorker do
  let(:now) { Time.zone.parse("2026-05-23 16:00") }

  before do
    allow(ImportShiftsFromXListJob).to receive(:perform_now).and_return(imported_count: 0)
    allow(ShiftNotificationScanner).to receive(:call).and_return(sent_count: 0, checked_setting_count: 0)
    allow(CleanupTransientRecordsJob).to receive(:perform_now).and_return(nil)
  end

  it "runs imports and notification scanning on every call" do
    result = described_class.call(now: now + 30.minutes)

    expect(result).to include(
      import_shifts_from_x: { imported_count: 0 },
      shift_notifications: { sent_count: 0, checked_setting_count: 0 }
    )
    expect(ImportShiftsFromXListJob).to have_received(:perform_now)
    expect(ShiftNotificationScanner).to have_received(:call).with(now: now + 30.minutes)
    expect(CleanupTransientRecordsJob).not_to have_received(:perform_now)
  end

  it "runs cleanup on four-hour slots" do
    result = described_class.call(now: now)

    expect(result).to include(cleanup_transient_records: nil)
    expect(CleanupTransientRecordsJob).to have_received(:perform_now)
  end

  it "continues later tasks before raising when one task fails" do
    allow(ImportShiftsFromXListJob).to receive(:perform_now).and_raise("X failed")

    expect do
      described_class.call(now: now + 30.minutes)
    end.to raise_error(RuntimeError, /SmallWorker failed/)

    expect(ShiftNotificationScanner).to have_received(:call).with(now: now + 30.minutes)
  end
end
