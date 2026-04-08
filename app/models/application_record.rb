class ApplicationRecord < ActiveRecord::Base
  primary_abstract_class

  class_attribute :cleanup_before, default: 0
end
