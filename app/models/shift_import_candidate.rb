class ShiftImportCandidate < ApplicationRecord
  self.cleanup_before = 7.days

  belongs_to :shop, optional: true
  belongs_to :staff, optional: true

  validates :action, inclusion: { in: %w[add delete change] }
  validates :start_at, :source_post_id, :source_post_url, :raw_text, presence: true
  validates :end_at, presence: true, if: :requires_end_at?

  def requires_end_at?
    add? || change?
  end

  def add?
    action == "add"
  end

  def delete?
    action == "delete"
  end

  def change?
    action == "change"
  end
end
