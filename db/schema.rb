# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.0].define(version: 2025_07_17_121128) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "action_logs", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "action_type", null: false
    t.string "target_type", null: false
    t.bigint "target_id", null: false
    t.jsonb "detail"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "jwt_denylists", force: :cascade do |t|
    t.string "jti"
    t.datetime "exp"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index [ "jti" ], name: "index_jwt_denylists_on_jti"
  end

  create_table "shops", force: :cascade do |t|
    t.string "name", null: false
    t.float "latitude"
    t.float "longitude"
    t.string "site_url"
    t.string "image_url"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "staff_shifts", force: :cascade do |t|
    t.bigint "staff_id", null: false
    t.bigint "shop_id", null: false
    t.datetime "start_at", null: false
    t.datetime "end_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
  end

  create_table "staffs", force: :cascade do |t|
    t.string "name", null: false
    t.string "image_url"
    t.string "site_url"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.bigint "shop_id", null: false
  end

  create_table "users", force: :cascade do |t|
    t.string "email", default: "", null: false
    t.string "encrypted_password", default: "", null: false
    t.string "reset_password_token"
    t.datetime "reset_password_sent_at"
    t.datetime "remember_created_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index [ "email" ], name: "index_users_on_email", unique: true
    t.index [ "reset_password_token" ], name: "index_users_on_reset_password_token", unique: true
  end
end
