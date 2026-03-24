module Schedules
  class TodayService
    def initialize(user:)
      @user = user
    end

    def call
      today_begin = Time.current.beginning_of_day
      today_end = Time.current.end_of_day

      shifts = StaffShift
        .where(start_at: today_begin..today_end)
        .includes(staff: :shop)

      # Filter out orphaned shifts (staff or shop deleted)
      shifts = shifts.select { |sh| sh.staff.present? && sh.staff.shop.present? }

      if @user
        preferences = @user.staff_preferences.index_by(&:staff_id)
      else
        preferences = {}
      end

      # Group by shop
      grouped = shifts.group_by { |sh| sh.staff.shop }

      grouped.map do |shop, shop_shifts|
        staffs = shop_shifts.map do |shift|
          pref = preferences[shift.staff_id]
          {
            staff_id: shift.staff_id,
            name: shift.staff.name,
            image_url: shift.staff.image_url,
            site_url: shift.staff.site_url,
            start_at: shift.start_at.iso8601,
            end_at: shift.end_at.iso8601,
            score: pref&.score || 0
          }
        end

        staffs.sort_by! { |s| [ s[:start_at], s[:name].to_s ] }

        {
          shop_id: shop.id,
          shop_name: shop.name,
          staffs: staffs
        }
      end.sort_by { |g| [ g[:staffs].first[:start_at], g[:shop_name].to_s ] }
    end
  end
end
