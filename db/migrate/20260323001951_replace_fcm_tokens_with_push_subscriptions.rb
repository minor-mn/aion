class ReplaceFcmTokensWithPushSubscriptions < ActiveRecord::Migration[8.0]
  def change
    drop_table :fcm_tokens do |t|
      t.references :user, null: false, foreign_key: true
      t.string :token
      t.timestamps
    end

    create_table :push_subscriptions do |t|
      t.references :user, null: false, foreign_key: true
      t.string :endpoint, null: false
      t.string :p256dh, null: false
      t.string :auth, null: false

      t.timestamps
    end
    add_index :push_subscriptions, :endpoint, unique: true
  end
end
