class AddSourceImageUrlsToShiftImportCandidates < ActiveRecord::Migration[8.0]
  def change
    add_column :shift_import_candidates, :source_image_urls, :jsonb, default: [], null: false
  end
end
