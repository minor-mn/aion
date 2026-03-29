class CreateShiftImportCandidates < ActiveRecord::Migration[8.0]
  def change
    create_table :shift_import_candidates do |t|
      t.references :shop, foreign_key: true
      t.references :staff, foreign_key: true
      t.string :action, null: false, default: "add"
      t.string :parsed_shop_name
      t.string :parsed_staff_name
      t.string :source_username
      t.datetime :start_at, null: false
      t.datetime :end_at
      t.string :source_post_id, null: false
      t.string :source_post_url, null: false
      t.datetime :source_posted_at
      t.text :raw_text, null: false

      t.timestamps
    end

    add_index :shift_import_candidates, :source_post_id
  end
end
