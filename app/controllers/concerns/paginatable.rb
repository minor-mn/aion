module Paginatable
  extend ActiveSupport::Concern

  DEFAULT_PAGE = 1
  DEFAULT_SIZE = 10

  private

  def page_number
    value = params[:p].to_i
    value.positive? ? value : DEFAULT_PAGE
  end

  def page_size
    value = params[:s].to_i
    value.positive? ? value : DEFAULT_SIZE
  end

  def pagination_limit
    page_size
  end

  def pagination_offset
    (page_number - 1) * page_size
  end
end
