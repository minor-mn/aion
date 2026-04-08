class CreateSeatAvailabilities < ActiveRecord::Migration[8.0]
  def change
    create_table :seat_availabilities do |t|
      t.references :shop, null: false, foreign_key: true
      t.references :staff, null: false, foreign_key: true
      t.references :staff_shift, null: false, foreign_key: true, index: { unique: true }
      t.string :source_post_id, null: false
      t.string :source_post_url, null: false
      t.datetime :source_posted_at, null: false
      t.string :detected_keyword, null: false
      t.text :raw_text, null: false

      t.timestamps
    end

    add_index :seat_availabilities, :source_post_id
    add_index :seat_availabilities, :source_posted_at
  end
end
