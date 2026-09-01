require "rails_helper"
require "tmpdir"

RSpec.describe "Debug", type: :request do
  before do
    @debug_log_root = Dir.mktmpdir("debug-log-spec")
    allow(Rails).to receive(:root).and_return(Pathname.new(@debug_log_root))
  end

  after do
    FileUtils.remove_entry(@debug_log_root) if @debug_log_root
  end

  it "saves the raw request body in a timestamped log file" do
    timestamp = Time.zone.local(2026, 9, 1, 12, 34, 56)
    payload = "{\"message\":\"そのまま保存\"}\nraw body"
    allow(Time).to receive(:current).and_return(timestamp)

    post "/api/v1/debug", params: payload, headers: { "CONTENT_TYPE" => "text/plain" }

    expect(response).to have_http_status(:ok)
    expect(File.binread(Rails.root.join("log/20260901123456.log"))).to eq(payload)
  end
end
