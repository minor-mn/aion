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

  describe "#import_tweet" do
    let(:shop) { Shop.create!(name: "Test Shop") }
    let(:staff) { Staff.create!(shop: shop, name: "Staff A", site_url: "https://x.com/staff_a") }
    let(:client) { instance_double(ShiftImports::XListClient) }
    let(:parser) { instance_double(ShiftImports::OpenaiShiftParser) }
    let(:matcher) { instance_double(ShiftImports::CandidateMatcher) }
    let(:service) { described_class.new(client: client, parser: parser, matcher: matcher) }

    before do
      allow(parser).to receive(:parse_post).and_return({ "actions" => [] })
    end

    it "logs no_action posts as skip entries" do
      expect do
        service.send(
          :import_tweet,
          { "id" => "1000", "text" => "今日はがんばる", "created_at" => "2026-04-21T07:00:00Z" },
          media_by_key: {},
          username: "staff_a",
          staff: staff,
          shop: shop
        )
      end.to change(ShiftImportCandidate, :count).by(1)

      candidate = ShiftImportCandidate.order(:id).last
      expect(candidate.action).to eq("skip")
      expect(candidate.result_message).to eq("no_actions")
      expect(candidate.source_post_id).to eq("1000")
    end

    it "deletes the current shift when delete-intent post arrives during shift" do
      shift = StaffShift.create!(
        shop: shop,
        staff: staff,
        start_at: Time.zone.parse("2026-04-21 12:00"),
        end_at: Time.zone.parse("2026-04-21 18:00")
      )

      result = nil
      expect do
        result = service.send(
          :import_tweet,
          { "id" => "1001", "text" => "今日はいません", "created_at" => "2026-04-21T07:00:00Z" },
          media_by_key: {},
          username: "staff_a",
          staff: staff,
          shop: shop
        )
      end.to change(StaffShift, :count).by(-1)

      expect(result).to eq(imported_count: 1, had_errors: false)
      expect(StaffShift.where(id: shift.id)).to be_empty
    end

    it "logs retweets as skip entries" do
      expect do
        service.send(
          :import_tweet,
          {
            "id" => "1003",
            "text" => "RT いい投稿",
            "created_at" => "2026-04-21T07:00:00Z",
            "referenced_tweets" => [ { "type" => "retweeted", "id" => "999" } ]
          },
          media_by_key: {},
          username: "staff_a",
          staff: staff,
          shop: shop
        )
      end.to change(ShiftImportCandidate, :count).by(1)

      candidate = ShiftImportCandidate.order(:id).last
      expect(candidate.action).to eq("skip")
      expect(candidate.result_message).to eq("retweet")
      expect(candidate.source_post_id).to eq("1003")
    end

    it "deletes the next shift when delete-intent post arrives outside shift time" do
      first_shift = StaffShift.create!(
        shop: shop,
        staff: staff,
        start_at: Time.zone.parse("2026-04-22 12:00"),
        end_at: Time.zone.parse("2026-04-22 18:00")
      )
      StaffShift.create!(
        shop: shop,
        staff: staff,
        start_at: Time.zone.parse("2026-04-23 12:00"),
        end_at: Time.zone.parse("2026-04-23 18:00")
      )

      result = nil
      expect do
        result = service.send(
          :import_tweet,
          { "id" => "1002", "text" => "本日はいません", "created_at" => "2026-04-21T07:00:00Z" },
          media_by_key: {},
          username: "staff_a",
          staff: staff,
          shop: shop
        )
      end.to change(StaffShift, :count).by(-1)

      expect(result).to eq(imported_count: 1, had_errors: false)
      expect(StaffShift.where(id: first_shift.id)).to be_empty
      expect(StaffShift.order(:start_at).first.start_at.to_i).to eq(Time.zone.parse("2026-04-23 12:00").to_i)
    end

    it "defaults end_at to 23:00 when start time is 17-18 and end time is missing" do
      allow(parser).to receive(:parse_post).and_return(
        {
          "shop_name" => "Test Shop",
          "staff_name" => "Staff A",
          "actions" => [
            {
              "action" => "add",
              "date" => "2026-04-26",
              "start_time" => "18:00",
              "end_time" => nil
            }
          ]
        }
      )

      result = service.send(
        :import_tweet,
        { "id" => "1004", "text" => "26日の18:00~お給仕", "created_at" => "2026-04-21T07:00:00Z" },
        media_by_key: {},
        username: "staff_a",
        staff: staff,
        shop: shop
      )

      expect(result).to eq(imported_count: 1, had_errors: false)
      shift = StaffShift.order(:id).last
      expect(shift.start_at.to_i).to eq(Time.zone.parse("2026-04-26 18:00").to_i)
      expect(shift.end_at.to_i).to eq(Time.zone.parse("2026-04-26 23:00").to_i)
    end

    it "defaults end_at to next day 05:00 when start time is 20:00 or later and end time is missing" do
      allow(parser).to receive(:parse_post).and_return(
        {
          "shop_name" => "Test Shop",
          "staff_name" => "Staff A",
          "actions" => [
            {
              "action" => "add",
              "date" => "2026-04-26",
              "start_time" => "20:30",
              "end_time" => nil
            }
          ]
        }
      )

      result = service.send(
        :import_tweet,
        { "id" => "1005", "text" => "26日の20:30~お給仕", "created_at" => "2026-04-21T07:00:00Z" },
        media_by_key: {},
        username: "staff_a",
        staff: staff,
        shop: shop
      )

      expect(result).to eq(imported_count: 1, had_errors: false)
      shift = StaffShift.order(:id).last
      expect(shift.start_at.to_i).to eq(Time.zone.parse("2026-04-26 20:30").to_i)
      expect(shift.end_at.to_i).to eq(Time.zone.parse("2026-04-27 05:00").to_i)
    end
  end
end
