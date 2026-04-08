class SeatAvailability < ApplicationRecord
  self.cleanup_before = 3.hours

  belongs_to :shop
  belongs_to :staff
  belongs_to :staff_shift

  validates :source_post_id, :source_post_url, :source_posted_at, :detected_keyword, :raw_text, presence: true

  def seat_score(now = Time.current)
    elapsed_seconds = now - source_posted_at
    return 0 if elapsed_seconds.negative?

    elapsed_minutes = elapsed_seconds / 60.0
    case elapsed_minutes
    when 0..30
      5
    when 30..60
      4
    when 60..90
      3
    when 90..120
      2
    when 120..180
      1
    else
      0
    end
  end
end
