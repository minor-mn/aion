class ImportCursor < ApplicationRecord
  validates :source_key, presence: true, uniqueness: true
end
