class CreateActionLogs < ActiveRecord::Migration[8.0]
  def change
    create_table :action_logs do |t|
      t.bigint :user_id, null: false
      t.string :action_type, null: false
      t.string :target_type, null: false
      t.bigint :target_id, null: false
      t.jsonb :detail

      t.timestamps
    end
  end
end
