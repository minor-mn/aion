class ActionLog < ApplicationRecord
  belongs_to :user
  belongs_to :shop, optional: true
  belongs_to :staff, optional: true

  validates :action_type, presence: true
  validates :target_type, presence: true

  def as_json(options = {})
    result = super(options.except(:include_user_email))
    result["user_email"] = user&.email if options[:include_user_email]
    result
  end
end
