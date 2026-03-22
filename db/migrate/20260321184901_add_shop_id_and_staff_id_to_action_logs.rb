class AddShopIdAndStaffIdToActionLogs < ActiveRecord::Migration[8.0]
  def change
    add_column :action_logs, :shop_id, :bigint
    add_column :action_logs, :staff_id, :bigint
  end
end
