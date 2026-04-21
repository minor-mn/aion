class CreateCheckIns < ActiveRecord::Migration[8.0]
  def change
    create_table :check_ins do |t|
      t.references :user, null: false, foreign_key: true
      t.references :shop, null: false, foreign_key: true
      t.datetime :checked_in_at, null: false
      t.datetime :checked_out_at
      t.timestamps
    end
    add_index :check_ins, [ :user_id, :checked_out_at ]
    add_index :check_ins, [ :shop_id, :checked_in_at ]
  end
end
