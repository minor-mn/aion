class CreateTotalRates < ActiveRecord::Migration[8.0]
  def change
    create_table :total_rates do |t|
      t.references :staff, null: false, foreign_key: true
      t.integer :year, null: false
      t.integer :total_overall_rate, null: false, default: 0
      t.integer :total_appearance_rate, null: false, default: 0
      t.integer :total_service_rate, null: false, default: 0
      t.integer :total_mood_rate, null: false, default: 0
      t.integer :check_in_count, null: false, default: 0
      t.timestamps
    end
    add_index :total_rates, [:staff_id, :year], unique: true
  end
end
