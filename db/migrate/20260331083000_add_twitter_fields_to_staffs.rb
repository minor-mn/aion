class AddTwitterFieldsToStaffs < ActiveRecord::Migration[8.0]
  def change
    add_column :staffs, :twitter_user_id, :string
    add_column :staffs, :twitter_since_id, :string

    add_index :staffs, :twitter_user_id
  end
end
