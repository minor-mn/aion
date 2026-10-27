require "rails_helper"

RSpec.describe NotificationSetting do
  let(:user) { User.create!(email: "setting@example.com", password: "password", confirmed_at: Time.current) }

  def setting_with(minutes)
    described_class.new(user: user, notify_minutes_before: minutes)
  end

  it "allows 0 to turn off shift start notifications" do
    expect(setting_with(0)).to be_valid
  end

  it "allows 30 minutes or more" do
    expect(setting_with(30)).to be_valid
    expect(setting_with(90)).to be_valid
  end

  it "rejects lead times shorter than 30 minutes" do
    setting = setting_with(15)

    expect(setting).not_to be_valid
    expect(setting.errors.full_messages).to include(/30分以上/)
  end
end
