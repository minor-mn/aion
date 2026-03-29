class AddResultFieldsToShiftImportCandidates < ActiveRecord::Migration[8.0]
  def change
    add_column :shift_import_candidates, :applied, :boolean, null: false, default: false
    add_column :shift_import_candidates, :result_message, :string
  end
end
