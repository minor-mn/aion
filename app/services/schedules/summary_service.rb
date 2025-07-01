module Schedules
  class SummaryService
    def initialize(user:, datetime_begin:, datetime_end:)
      @user = user
      @datetime_begin_param = datetime_begin
      @datetime_end_param = datetime_end
    end

    def call
      begin
        datetime_begin = parse_datetime(@datetime_begin_param) || Time.current.beginning_of_day
        datetime_end = parse_datetime(@datetime_end_param) || Time.current.end_of_day
      rescue ArgumentError
        raise ParameterError, "Invalid date format"
      end

      preferences = @user.staff_preferences.index_by(&:staff_id)
      staff_ids = preferences.keys

      shifts = StaffShift
        .where(staff_id: staff_ids)
        .where(start_at: datetime_begin..datetime_end)
        .includes(staff: :shop)

      group_by_date = shifts.group_by { |sh| sh.start_at.to_date }

      result = group_by_date.map do |date, shifts_on_date|
        staffs = shifts_on_date.map do |shift|
          pref = preferences[shift.staff_id]
          {
            staff_id:       shift.staff_id,
            name:           shift.staff.name,
            shop_id:        shift.staff.shop.id,
            shop_name:      shift.staff.shop.name,
            datetime_begin: shift.start_at.iso8601,
            datetime_end:   shift.end_at.iso8601,
            score:          pref&.score || 0
          }
        end

        {
          date:         date.to_s,
          total_score:  staffs.sum { |s| s[:score] },
          staffs:       staffs
        }
      end

      result.sort_by { |rec| rec[:date] }
    end

    private

    def parse_datetime(param)
      return nil if param.blank?
      Time.zone.parse(param)
    end
  end
end
