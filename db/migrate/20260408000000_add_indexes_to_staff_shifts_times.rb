class AddIndexesToStaffShiftsTimes < ActiveRecord::Migration[8.0]
  def change
    add_index :staff_shifts, :start_at
    add_index :staff_shifts, :end_at
  end
end
