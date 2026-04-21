class V1::ShiftImportCandidatesController < ApplicationController
  include Paginatable

  before_action :authenticate_user!
  before_action :require_operator!
  before_action :set_candidate, only: %i[approve destroy]

  def index
    cutoff = 1.week.ago
    grouped_candidates = ShiftImportCandidate.includes(:shop, :staff)
      .where("COALESCE(source_posted_at, created_at) >= ?", cutoff)
      .order(source_posted_at: :desc, source_post_id: :desc, start_at: :asc, id: :asc)
      .group_by(&:source_post_id)
      .map do |post_id, candidates|
        first_candidate = candidates.first
        {
          source_post_id: post_id,
          source_post_url: first_candidate.source_post_url,
          source_posted_at: first_candidate.source_posted_at&.iso8601,
          source_username: first_candidate.source_username,
          raw_text: first_candidate.raw_text,
          parsed_shop_name: first_candidate.parsed_shop_name,
          parsed_staff_name: first_candidate.parsed_staff_name,
          entries: candidates.map { |candidate| serialize_candidate(candidate) }
        }
      end

    paginated_groups = grouped_candidates.slice(pagination_offset, pagination_limit) || []

    render json: {
      shift_import_posts: paginated_groups,
      shift_import_candidates: paginated_groups,
      total_posts: grouped_candidates.size
    }
  end

  def import_from_x
    result = ShiftImports::ImportFromXList.new.call
    render json: result, status: :ok
  rescue ShiftImports::XListClient::RequestError => e
    render json: { error: format_x_api_error(e) }, status: :unprocessable_entity
  rescue StandardError => e
    render json: { error: e.message.presence || "Xからの取り込みに失敗しました" }, status: :unprocessable_entity
  end

  def approve
    if @candidate.shop_id.blank? || @candidate.staff_id.blank?
      return render json: { error: "candidate is missing matched shop or staff" }, status: :unprocessable_entity
    end

    result = ShiftImports::ActionApplier.new(
      shop: @candidate.shop,
      staff: @candidate.staff,
      action: @candidate.action,
      start_at: @candidate.start_at,
      end_at: @candidate.end_at
    ).call(user: current_user)
    @candidate.destroy!
    render json: result, status: :ok
  end

  def destroy
    @candidate.destroy!
    head :no_content
  end

  private

  def set_candidate
    @candidate = ShiftImportCandidate.find(params[:id])
  end

  def serialize_candidate(candidate)
    {
      id: candidate.id,
      action: candidate.action,
      applied: candidate.applied,
      result_message: candidate.result_message,
      shop_id: candidate.shop_id,
      shop_name: candidate.shop&.name,
      parsed_shop_name: candidate.parsed_shop_name,
      staff_id: candidate.staff_id,
      staff_name: candidate.staff&.name,
      parsed_staff_name: candidate.parsed_staff_name,
      source_username: candidate.source_username,
      start_at: candidate.start_at.iso8601,
      end_at: candidate.end_at&.iso8601,
      source_post_id: candidate.source_post_id,
      source_post_url: candidate.source_post_url,
      source_posted_at: candidate.source_posted_at&.iso8601,
      raw_text: candidate.raw_text
    }
  end

  def format_x_api_error(error)
    body = JSON.parse(error.body.to_s)
    detail = body["detail"] || body["title"] || body.dig("errors", 0, "message")
    "X APIエラー(#{error.status}): #{detail.presence || '認証情報または契約状態を確認してください'}"
  rescue JSON::ParserError
    "X APIエラー(#{error.status}): 認証情報または契約状態を確認してください"
  end
end
