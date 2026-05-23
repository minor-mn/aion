class NullifyShiftImportCandidateStaffOnDelete < ActiveRecord::Migration[8.0]
  def change
    remove_foreign_key :shift_import_candidates, :staffs
    add_foreign_key :shift_import_candidates, :staffs, on_delete: :nullify
  end
end
