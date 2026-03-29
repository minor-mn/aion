class CreateImportCursors < ActiveRecord::Migration[8.0]
  def change
    create_table :import_cursors do |t|
      t.string :source_key, null: false
      t.string :last_post_id

      t.timestamps
    end

    add_index :import_cursors, :source_key, unique: true
  end
end
