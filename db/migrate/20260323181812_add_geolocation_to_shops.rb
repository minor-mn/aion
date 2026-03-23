class AddGeolocationToShops < ActiveRecord::Migration[8.0]
  def change
    add_column :shops, :latitude, :decimal, precision: 10, scale: 6 unless column_exists?(:shops, :latitude)
    add_column :shops, :longitude, :decimal, precision: 10, scale: 6 unless column_exists?(:shops, :longitude)
  end
end
