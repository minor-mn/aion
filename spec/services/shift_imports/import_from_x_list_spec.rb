require "rails_helper"

RSpec.describe ShiftImports::ImportFromXList do
  describe "#import_staff_timeline" do
    it "syncs profile name and image_url from X during import" do
      shop = Shop.create!(name: "Test Shop")
      staff = Staff.create!(
        shop: shop,
        name: "Old Name",
        image_url: "https://example.com/old.jpg",
        site_url: "https://x.com/test_staff",
        twitter_user_id: "42"
      )

      client = instance_double(ShiftImports::XListClient)
      parser = instance_double(ShiftImports::OpenaiShiftParser)
      matcher = instance_double(ShiftImports::CandidateMatcher)

      allow(matcher).to receive(:username_from_site_url).with(staff.site_url).and_return("test_staff")
      allow(client).to receive(:fetch_user_by_username).with(username: "test_staff").and_return(
        "data" => {
          "id" => "42",
          "name" => "New Name",
          "profile_image_url" => "https://example.com/new_normal.jpg"
        }
      )
      allow(client).to receive(:fetch_user_tweets).with(user_id: "42", max_results: 5).and_return(
        "data" => [],
        "meta" => {}
      )

      service = described_class.new(client: client, parser: parser, matcher: matcher)

      result = service.send(:import_staff_timeline, staff)

      expect(result).to eq(imported_count: 0, had_errors: false)
      expect(staff.reload.name).to eq("New Name")
      expect(staff.image_url).to eq("https://example.com/new.jpg")
    end
  end
end
