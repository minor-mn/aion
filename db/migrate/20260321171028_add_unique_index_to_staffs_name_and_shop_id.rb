class AddUniqueIndexToStaffsNameAndShopId < ActiveRecord::Migration[8.0]
  def change
    add_index :staffs, [ :shop_id, :name ], unique: true
  end
end
