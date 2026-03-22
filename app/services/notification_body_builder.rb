class NotificationBodyBuilder
  # Build notification body in format: "17:00 店舗名 キャスト名1 キャスト名2 キャスト名3"
  def self.build(start_at, shifts)
    time_str = start_at.strftime("%H:%M")
    shop_name = shifts.first.staff.shop.name
    staff_names = shifts.map { |s| s.staff.name }.sort
    "#{time_str} #{shop_name} #{staff_names.join(' ')}"
  end
end
