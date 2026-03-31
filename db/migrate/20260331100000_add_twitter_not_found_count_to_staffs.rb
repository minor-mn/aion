class AddTwitterNotFoundCountToStaffs < ActiveRecord::Migration[8.0]
  def change
    add_column :staffs, :twitter_not_found_count, :integer, null: false, default: 0
  end
end
