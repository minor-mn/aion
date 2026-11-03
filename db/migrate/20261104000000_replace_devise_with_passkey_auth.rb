class ReplaceDeviseWithPasskeyAuth < ActiveRecord::Migration[8.0]
  # 認証は crystal-p2p-server（https://an.umr.biz/auth/）に移し、users は通知とデータの紐付けだけを持つ。
  # メール・パスワードで作られた既存のユーザーは、パスキーのアカウントと紐付けない。
  def change
    add_column :users, :auth_sub, :string
    add_column :users, :username, :string
    add_index :users, :auth_sub, unique: true

    remove_index :users, :email, unique: true
    remove_index :users, :reset_password_token, unique: true
    remove_index :users, :confirmation_token, unique: true
    remove_column :users, :email, :string, default: "", null: false
    remove_column :users, :encrypted_password, :string, default: "", null: false
    remove_column :users, :reset_password_token, :string
    remove_column :users, :reset_password_sent_at, :datetime
    remove_column :users, :remember_created_at, :datetime
    remove_column :users, :confirmation_token, :string
    remove_column :users, :confirmed_at, :datetime
    remove_column :users, :confirmation_sent_at, :datetime
    remove_column :users, :unconfirmed_email, :string

    drop_table :jwt_denylists do |t|
      t.string :jti
      t.datetime :exp
      t.timestamps
      t.index :jti
    end
  end
end
