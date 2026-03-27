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

      if @user
        preferences = @user.staff_preferences.index_by(&:staff_id)
        staff_ids = preferences.keys

        shifts = StaffShift
          .where(staff_id: staff_ids)
          .where(start_at: datetime_begin..datetime_end)
          .includes(staff: :shop)
      else
        preferences = {}
        shifts = StaffShift
          .where(start_at: datetime_begin..datetime_end)
          .includes(staff: :shop)
      end

      # Filter out orphaned shifts (staff or shop deleted)
      shifts = shifts.select { |sh| sh.staff.present? && sh.staff.shop.present? }

      group_by_date = shifts.group_by { |sh| sh.start_at.to_date }

      # Load events in the date range
      events = Event.where("(start_at BETWEEN ? AND ?) OR (end_at BETWEEN ? AND ?) OR (start_at <= ? AND end_at >= ?)",
        datetime_begin, datetime_end, datetime_begin, datetime_end, datetime_begin, datetime_end)
        .includes(:shop)

      events_by_date = events.group_by { |e| (e.start_at || e.created_at).to_date }

      # Collect all dates that have shifts or events
      all_dates = (group_by_date.keys + events_by_date.keys).uniq

      result = all_dates.map do |date|
        shifts_on_date = group_by_date[date] || []
        staffs = shifts_on_date.map do |shift|
          pref = preferences[shift.staff_id]
          {
            staff_id:       shift.staff_id,
            user_id:        shift.staff.user_id,
            name:           shift.staff.name,
            image_url:      shift.staff.image_url,
            site_url:       shift.staff.site_url,
            shop_id:        shift.staff.shop.id,
            shop_name:      shift.staff.shop.name,
            datetime_begin: shift.start_at.iso8601,
            datetime_end:   shift.end_at.iso8601,
            score:          pref&.score || 0
          }
        end

        date_events = (events_by_date[date] || []).map do |event|
          {
            id:        event.id,
            user_id:   event.user_id,
            title:     event.title,
            url:       event.url,
            shop_id:   event.shop_id,
            shop_name: event.shop.name,
            start_at:  event.start_at&.iso8601,
            end_at:    event.end_at&.iso8601
          }
        end

        {
          date:         date.to_s,
          total_score:  staffs.sum { |s| s[:score] },
          staffs:       staffs.sort_by { |s| s[:name].to_s },
          events:       date_events
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
