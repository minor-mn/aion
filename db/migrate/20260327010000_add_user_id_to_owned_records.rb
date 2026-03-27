class AddUserIdToOwnedRecords < ActiveRecord::Migration[8.0]
  def change
    add_reference :shops, :user, foreign_key: true
    add_reference :staffs, :user, foreign_key: true
    add_reference :events, :user, foreign_key: true
    add_reference :staff_shifts, :user, foreign_key: true
  end
end
