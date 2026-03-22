class CreateNotificationSettings < ActiveRecord::Migration[8.0]
  def change
    create_table :notification_settings do |t|
      t.references :user, null: false, foreign_key: true, index: { unique: true }
      t.boolean :notifications_enabled, default: false, null: false
      t.integer :score_threshold_shop, default: 0, null: false
      t.integer :score_threshold_staff, default: 0, null: false
      t.boolean :notify_morning, default: false, null: false
      t.integer :notify_minutes_before, default: 0, null: false

      t.timestamps
    end
  end
end
