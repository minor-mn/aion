require "rails_helper"

RSpec.describe ShiftNotificationScanner do
  let(:now) { Time.zone.parse("2026-05-23 16:00") }
  let(:user) { User.create!(email: "notify@example.com", password: "password", confirmed_at: Time.current) }
  let(:shop) { Shop.create!(name: "Test Shop") }
  let(:staff) { Staff.create!(name: "Alice", shop: shop) }

  before do
    PushSubscription.create!(
      user: user,
      endpoint: "https://push.example.com/subscription",
      p256dh: "p256dh",
      auth: "auth"
    )
    NotificationSetting.create!(
      user: user,
      notifications_enabled: true,
      score_threshold_shop: 5,
      notify_minutes_before: 60
    )
    StaffPreference.create!(user: user, staff: staff, score: 5)
  end

  it "sends and records a notification for a qualifying shift inside the lookahead window" do
    StaffShift.create!(
      shop: shop,
      staff: staff,
      start_at: now + 45.minutes,
      end_at: now + 3.hours
    )

    allow(WebPushService).to receive(:send_notification).and_return(true)

    expect do
      result = described_class.call(now: now)
      expect(result).to eq(sent_count: 1, checked_setting_count: 1)
    end.to change(SentShiftNotification, :count).by(1)

    expect(WebPushService).to have_received(:send_notification).once
    notification = SentShiftNotification.last
    expect(notification.user).to eq(user)
    expect(notification.shop).to eq(shop)
    expect(notification.start_at.to_i).to eq((now + 45.minutes).to_i)
    expect(notification.body).to eq("16:45 Test Shop Alice")
  end

  it "does not send the same shop and start time twice" do
    StaffShift.create!(
      shop: shop,
      staff: staff,
      start_at: now + 45.minutes,
      end_at: now + 3.hours
    )

    allow(WebPushService).to receive(:send_notification).and_return(true)

    described_class.call(now: now)

    expect do
      result = described_class.call(now: now + 10.minutes)
      expect(result).to eq(sent_count: 0, checked_setting_count: 1)
    end.not_to change(SentShiftNotification, :count)

    expect(WebPushService).to have_received(:send_notification).once
  end

  it "ignores shifts outside the user's notification window" do
    user.notification_setting.update!(notify_minutes_before: 30)
    StaffShift.create!(
      shop: shop,
      staff: staff,
      start_at: now + 45.minutes,
      end_at: now + 3.hours
    )

    allow(WebPushService).to receive(:send_notification).and_return(true)

    result = described_class.call(now: now)

    expect(result).to eq(sent_count: 0, checked_setting_count: 1)
    expect(WebPushService).not_to have_received(:send_notification)
  end

  it "ignores shifts below the shop score threshold" do
    user.staff_preferences.find_by!(staff: staff).update!(score: 4)
    StaffShift.create!(
      shop: shop,
      staff: staff,
      start_at: now + 45.minutes,
      end_at: now + 3.hours
    )

    allow(WebPushService).to receive(:send_notification).and_return(true)

    result = described_class.call(now: now)

    expect(result).to eq(sent_count: 0, checked_setting_count: 1)
    expect(WebPushService).not_to have_received(:send_notification)
  end
end
