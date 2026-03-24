class CreateEvents < ActiveRecord::Migration[8.0]
  def change
    create_table :events do |t|
      t.references :shop, null: false, foreign_key: true
      t.string :title, null: false
      t.string :url
      t.datetime :start_at
      t.datetime :end_at

      t.timestamps
    end

    add_index :events, :start_at
  end
end
