class CreateStaffs < ActiveRecord::Migration[8.0]
  def change
    create_table :staffs do |t|
      t.string :name, null: false
      t.string :image_url, null: true
      t.string :site_url, null: true

      t.timestamps
    end
  end
end
