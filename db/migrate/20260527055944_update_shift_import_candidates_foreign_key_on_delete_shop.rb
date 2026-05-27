class UpdateShiftImportCandidatesForeignKeyOnDeleteShop < ActiveRecord::Migration[8.0]
  def change
    remove_foreign_key :shift_import_candidates, :shops
    add_foreign_key :shift_import_candidates, :shops, on_delete: :nullify
  end
end
