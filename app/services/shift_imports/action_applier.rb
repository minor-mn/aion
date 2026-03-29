module ShiftImports
  class ActionApplier
    def initialize(shop:, staff:, action:, start_at:, end_at:)
      @shop = shop
      @staff = staff
      @action = action
      @start_at = start_at
      @end_at = end_at
    end

    def call(user: nil)
      case @action
      when "add"
        apply_add(user: user)
      when "delete"
        apply_delete
      when "change"
        apply_change(user: user)
      else
        { action: @action, applied: false, message: "unsupported action" }
      end
    end

    private

    def apply_add(user:)
      staff_shift = StaffShift.create!(
        shop: @shop,
        staff: @staff,
        start_at: @start_at,
        end_at: @end_at,
        user: user
      )
      ScheduleShiftNotificationsJob.perform_later(staff_shift.id) if staff_shift.start_at.to_date == Date.current

      { action: "add", applied: true, message: "shift added", staff_shift: staff_shift }
    end

    def apply_delete
      shifts = matching_shifts
      deleted_count = shifts.size
      shifts.find_each(&:destroy!)

      { action: "delete", applied: deleted_count.positive?, message: deleted_count.positive? ? "#{deleted_count} shift(s) deleted" : "no matching shift found" }
    end

    def apply_change(user:)
      shifts = matching_shifts.to_a
      return { action: "change", applied: false, message: "no matching shift found" } if shifts.empty?
      return { action: "change", applied: false, message: "multiple matching shifts found" } if shifts.size > 1

      shift = shifts.first
      shift.update!(start_at: @start_at, end_at: @end_at, user: user)

      { action: "change", applied: true, message: "shift updated", staff_shift: shift }
    end

    def matching_shifts
      start_of_day = @start_at.in_time_zone.beginning_of_day
      end_of_day = @start_at.in_time_zone.end_of_day
      StaffShift.where(shop: @shop, staff: @staff, start_at: start_of_day..end_of_day)
    end
  end
end
