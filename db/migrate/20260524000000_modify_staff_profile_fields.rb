class ModifyStaffProfileFields < ActiveRecord::Migration[8.0]
  def change
    rename_column :staffs, :site_url, :x_url
    add_column :staffs, :birthday, :date
    add_column :staffs, :instagram_url, :string
    add_column :staffs, :tiktok_url, :string
  end
end
