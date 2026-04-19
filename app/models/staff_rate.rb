class StaffRate < ApplicationRecord
  RATE_COLUMNS = %i[overall_rate appearance_rate service_rate mood_rate].freeze

  belongs_to :check_in
  belongs_to :staff

  before_validation :autofill_rates

  RATE_COLUMNS.each do |col|
    validates col, numericality: {
      only_integer: true,
      greater_than_or_equal_to: 0,
      less_than_or_equal_to: 5,
      message: "は0以上5以下の整数で指定してください"
    }
  end

  validate :at_least_one_rated
  validate :all_rates_within_range_after_fill

  after_create :increment_total_rates

  private

  def autofill_rates
    raw = RATE_COLUMNS.map { |c| [c, self[c]] }.to_h
    rated = raw.select { |_, v| v.is_a?(Integer) && v.between?(1, 5) }
    return if rated.empty?

    filled = (rated.values.sum.to_f / rated.size).ceil
    RATE_COLUMNS.each do |c|
      v = self[c]
      if v.nil? || (v.is_a?(Integer) && v.zero?)
        self[c] = filled
      end
    end
  end

  def at_least_one_rated
    values = RATE_COLUMNS.map { |c| self[c] }
    if values.all? { |v| v.nil? || v == 0 }
      errors.add(:base, "1項目以上評価してください")
    end
  end

  def all_rates_within_range_after_fill
    RATE_COLUMNS.each do |c|
      v = self[c]
      next if v.nil?
      unless v.is_a?(Integer) && v.between?(0, 5)
        errors.add(c, "は0以上5以下の整数で指定してください")
      end
    end
  end

  def increment_total_rates
    year = (check_in&.checked_in_at || created_at || Time.current).year
    TotalRate.accumulate!(staff_id: staff_id, year: year, staff_rate: self)
  end
end
