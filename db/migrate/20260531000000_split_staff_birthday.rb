class SplitStaffBirthday < ActiveRecord::Migration[8.0]
  def change
    remove_column :staffs, :birthday, :date
    add_column :staffs, :birth_year, :integer
    add_column :staffs, :birth_month, :integer
    add_column :staffs, :birth_day, :integer
  end
end
