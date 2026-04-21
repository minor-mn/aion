class CreateStaffRates < ActiveRecord::Migration[8.0]
  def change
    create_table :staff_rates do |t|
      t.references :check_in, null: false, foreign_key: true
      t.references :staff, null: false, foreign_key: true
      t.integer :overall_rate, limit: 1, null: false, default: 0
      t.integer :appearance_rate, limit: 1, null: false, default: 0
      t.integer :service_rate, limit: 1, null: false, default: 0
      t.integer :mood_rate, limit: 1, null: false, default: 0
      t.timestamps
    end
    add_index :staff_rates, [ :check_in_id, :staff_id ], unique: true
  end
end
