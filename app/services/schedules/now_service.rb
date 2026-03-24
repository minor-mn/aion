module Schedules
  class NowService
    def initialize(user:)
      @user = user
    end

    def call
      now = Time.current

      shifts = StaffShift
        .where("start_at <= ? AND end_at >= ?", now, now)
        .includes(staff: :shop)

      # Filter out orphaned shifts (staff or shop deleted)
      shifts = shifts.select { |sh| sh.staff.present? && sh.staff.shop.present? }

      if @user
        preferences = @user.staff_preferences.index_by(&:staff_id)
      else
        preferences = {}
      end

      # Group current shifts by shop
      shift_by_shop = shifts.group_by { |sh| sh.staff.shop.id }

      # Return all shops with their current shifts (empty if none)
      Shop.all.map do |shop|
        shop_shifts = shift_by_shop[shop.id] || []

        staffs = shop_shifts.map do |shift|
          pref = preferences[shift.staff_id]
          {
            staff_id: shift.staff_id,
            name: shift.staff.name,
            start_at: shift.start_at.iso8601,
            end_at: shift.end_at.iso8601,
            score: pref&.score || 0
          }
        end

        staffs.sort_by! { |s| [ s[:start_at], s[:name].to_s ] }

        {
          shop_id: shop.id,
          shop_name: shop.name,
          address: shop.address,
          latitude: shop.latitude,
          longitude: shop.longitude,
          staffs: staffs
        }
      end.sort_by { |g| [ g[:shop_name].to_s ] }
    end
  end
end
