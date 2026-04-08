module ShiftImports
  class SeatAvailabilityRecorder
    KEYWORDS = [ "おせき", "お席", "💺", "🪑", "救世主" ].freeze

    def initialize(shop:, staff:, raw_text:, post_id:, post_url:, posted_at:)
      @shop = shop
      @staff = staff
      @raw_text = raw_text.to_s
      @post_id = post_id.to_s
      @post_url = post_url.to_s
      @posted_at = posted_at
    end

    def call
      return { applied: false, message: "shop or staff missing" } if @shop.blank? || @staff.blank?
      return { applied: false, message: "posted_at missing" } if @posted_at.blank?

      keyword = detected_keyword
      return { applied: false, message: "no seat keyword" } if keyword.blank?

      shift = matching_shift
      return { applied: false, message: "no matching active shift" } unless shift

      seat_availability = SeatAvailability.find_or_initialize_by(staff_shift: shift)
      seat_availability.shop = @shop
      seat_availability.staff = @staff
      seat_availability.source_post_id = @post_id
      seat_availability.source_post_url = @post_url
      seat_availability.source_posted_at = @posted_at
      seat_availability.detected_keyword = keyword
      seat_availability.raw_text = @raw_text
      seat_availability.save!

      { applied: true, message: "seat availability recorded", seat_availability: seat_availability }
    end

    private

    def detected_keyword
      KEYWORDS.find { |keyword| @raw_text.include?(keyword) }
    end

    def matching_shift
      StaffShift.where(shop: @shop, staff: @staff)
        .where("start_at <= ? AND end_at >= ?", @posted_at, @posted_at)
        .order(start_at: :desc)
        .first
    end
  end
end
