class CreateStaffPreferences < ActiveRecord::Migration[8.0]
  def change
    create_table :staff_preferences do |t|
      t.bigint :user_id, null: false
      t.bigint :staff_id, null: false
      t.integer :score, null: false, default: 0

      t.timestamps
    end
  end
end
