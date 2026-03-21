class AddUniqueIndexToShopsName < ActiveRecord::Migration[8.0]
  def change
    add_index :shops, :name, unique: true
  end
end
