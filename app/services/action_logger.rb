class ActionLogger
  def self.log(user:, action_type:, target:)
    ActionLog.create!(
      user_id: user.id,
      action_type: action_type,
      target_type: target.class.name,
      target_id: target.id,
      detail: target.as_json
    )
  end
end

