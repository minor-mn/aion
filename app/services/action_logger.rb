class ActionLogger
  def self.log(user:, action_type:, target:, detail: nil)
    shop_id = resolve_shop_id(target)
    staff_id = resolve_staff_id(target)

    ActionLog.create!(
      user_id: user.id,
      action_type: action_type,
      target_type: target.class.name,
      target_id: target.id,
      shop_id: shop_id,
      staff_id: staff_id,
      detail: detail || target.as_json
    )
  end

  def self.resolve_shop_id(target)
    case target
    when Shop
      target.id
    when Staff, StaffShift
      target.shop_id
    end
  end

  def self.resolve_staff_id(target)
    case target
    when Staff
      target.id
    when StaffShift
      target.staff_id
    end
  end

  private_class_method :resolve_shop_id, :resolve_staff_id
end
