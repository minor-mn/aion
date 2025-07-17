class CreateShops < ActiveRecord::Migration[8.0]
  def change
    create_table :shops do |t|
      t.string :name, null: false
      t.float :latitude, null: true
      t.float :longitude, null: true
      t.string :site_url, null: true
      t.string :image_url, null: true

      t.timestamps
    end
  end
end
