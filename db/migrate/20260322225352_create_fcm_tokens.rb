class CreateFcmTokens < ActiveRecord::Migration[8.0]
  def change
    create_table :fcm_tokens do |t|
      t.references :user, null: false, foreign_key: true
      t.string :token

      t.timestamps
    end
    add_index :fcm_tokens, :token, unique: true
  end
end
