class CreateStaffShifts < ActiveRecord::Migration[8.0]
  def change
    create_table :staff_shifts do |t|
      t.bigint :staff_id, null: false
      t.bigint :shop_id, null: false
      t.datetime :start_at, null: false
      t.datetime :end_at, null: false

      t.timestamps
    end
  end
end
