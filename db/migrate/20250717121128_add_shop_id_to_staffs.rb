class AddShopIdToStaffs < ActiveRecord::Migration[8.0]
  def change
    add_column :staffs, :shop_id, :bigint, null: false
  end
end
