module Schedules
  class TodayService
    def initialize(user:, shop_id: nil)
      @user = user
      @shop_id = parse_shop_id(shop_id)
    end

    def call
      today_begin = Time.current.beginning_of_day
      today_end = Time.current.end_of_day

      shifts = StaffShift
        .where(start_at: today_begin..today_end)
        .includes(staff: :shop)
      shifts = shifts.where(shop_id: @shop_id) if @shop_id

      # Filter out orphaned shifts (staff or shop deleted)
      shifts = shifts.select { |sh| sh.staff.present? && sh.staff.shop.present? }

      if @user
        preferences = @user.staff_preferences.index_by(&:staff_id)
      else
        preferences = {}
      end

      # Group by shop
      grouped = shifts.group_by { |sh| sh.staff.shop }

      # Load today's events
      events = Event.where("(start_at BETWEEN ? AND ?) OR (end_at BETWEEN ? AND ?) OR (start_at <= ? AND end_at >= ?)",
        today_begin, today_end, today_begin, today_end, today_begin, today_end)
      events = events.where(shop_id: @shop_id) if @shop_id

      events_by_shop = events.group_by(&:shop_id)

      grouped.map do |shop, shop_shifts|
        staffs = shop_shifts.map do |shift|
          pref = preferences[shift.staff_id]
          {
            staff_id: shift.staff_id,
            user_id: shift.staff.user_id,
            name: shift.staff.name,
            image_url: shift.staff.image_url,
            site_url: shift.staff.site_url,
            start_at: shift.start_at.iso8601,
            end_at: shift.end_at.iso8601,
            score: pref&.score || 0
          }
        end

        staffs.sort_by! { |s| [ s[:start_at], s[:name].to_s ] }

        shop_events = (events_by_shop[shop.id] || []).map do |event|
          {
            id: event.id,
            user_id: event.user_id,
            title: event.title,
            url: event.url,
            start_at: event.start_at&.iso8601,
            end_at: event.end_at&.iso8601
          }
        end

        {
          shop_id: shop.id,
          user_id: shop.user_id,
          shop_name: shop.name,
          staffs: staffs,
          events: shop_events
        }
      end.sort_by { |g| [ g[:staffs].first[:start_at], g[:shop_name].to_s ] }
    end

    private

    def parse_shop_id(param)
      return nil if param.blank?
      Integer(param, 10)
    rescue ArgumentError, TypeError
      raise ParameterError, "Invalid shop_id"
    end
  end
end
