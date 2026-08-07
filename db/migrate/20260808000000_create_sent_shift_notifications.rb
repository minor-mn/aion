class CreateSentShiftNotifications < ActiveRecord::Migration[8.0]
  def change
    create_table :sent_shift_notifications do |t|
      t.references :user, null: false, foreign_key: true
      t.references :shop, null: false, foreign_key: true
      t.datetime :start_at, null: false
      t.string :kind, null: false, default: "shift_start"
      t.text :body, null: false

      t.timestamps
    end

    add_index :sent_shift_notifications,
              [ :user_id, :shop_id, :start_at, :kind ],
              unique: true,
              name: "index_sent_shift_notifications_unique_delivery"
  end
end
