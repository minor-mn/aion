require "base64"
require "json"
require "net/http"
require "uri"

class GeminiClient
  API_BASE = "https://generativelanguage.googleapis.com/v1beta".freeze
  MAX_IMAGE_REDIRECTS = 3

  attr_reader :model

  def self.configured?(env = ENV)
    env["GEMINI_MODEL"].present? && env["GEMINI_API_KEY"].present?
  end

  def initialize(api_key: ENV["GEMINI_API_KEY"], model: ENV["GEMINI_MODEL"])
    @api_key = api_key.to_s.strip
    @model = model.to_s.strip
  end

  def validate_configuration!
    raise "GEMINI_MODEL is not configured" if @model.blank?
    raise "GEMINI_API_KEY is not configured" if @api_key.blank?
  end

  def generate_json(prompt:, response_schema:, image_urls: [])
    response = request_generate_content(
      prompt: prompt,
      response_schema: response_schema,
      image_urls: image_urls
    )
    parse_json_response(response)
  end

  def request_generate_content(prompt:, response_schema:, image_urls: [])
    validate_configuration!

    model_name = @model.sub(/\Amodels\//, "")
    uri = URI("#{API_BASE}/models/#{URI.encode_www_form_component(model_name)}:generateContent")
    request = Net::HTTP::Post.new(uri)
    request["Content-Type"] = "application/json"
    request["x-goog-api-key"] = @api_key
    request.body = JSON.generate(
      contents: [
        {
          role: "user",
          parts: build_parts(prompt, image_urls)
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: response_schema
      }
    )

    Net::HTTP.start(uri.host, uri.port, use_ssl: true, read_timeout: 60, open_timeout: 10) do |http|
      http.request(request)
    end
  end

  def parse_json_response(response)
    raise "Gemini request failed: #{response.code} #{response.body}" unless response.is_a?(Net::HTTPSuccess)

    body = JSON.parse(response.body)
    parts = Array(body.dig("candidates", 0, "content", "parts"))
    text_response = parts
      .reject { |part| part.is_a?(Hash) && part["thought"] }
      .filter_map { |part| part["text"] if part.is_a?(Hash) }
      .join
      .strip

    JSON.parse(text_response)
  end

  private

  def build_parts(prompt, image_urls)
    parts = [ { text: prompt } ]

    image_urls.each do |image_url|
      parts << fetch_image_part(image_url)
    end

    parts
  end

  def fetch_image_part(raw_url, redirect_count = 0)
    raise "Gemini image redirect limit exceeded: #{raw_url}" if redirect_count > MAX_IMAGE_REDIRECTS

    uri = URI.parse(raw_url.to_s)
    unless (uri.is_a?(URI::HTTP) || uri.is_a?(URI::HTTPS)) && uri.host.present?
      raise "Invalid image URL for Gemini: #{raw_url}"
    end

    request = Net::HTTP::Get.new(uri)
    response = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https", read_timeout: 20, open_timeout: 10) do |http|
      http.request(request)
    end

    case response
    when Net::HTTPRedirection
      location = response["location"].to_s
      raise "Gemini image redirect location missing: #{uri}" if location.blank?

      next_url = URI.join(uri, location).to_s
      fetch_image_part(next_url, redirect_count + 1)
    when Net::HTTPSuccess
      {
        inlineData: {
          mimeType: detect_mime_type(response["content-type"], uri),
          data: Base64.strict_encode64(response.body.to_s)
        }
      }
    else
      raise "Gemini image fetch failed: #{response.code} #{uri}"
    end
  end

  def detect_mime_type(content_type_header, uri)
    media_type = content_type_header.to_s.split(";").first.to_s.strip.downcase
    return "image/jpeg" if media_type == "image/jpg"
    return media_type if media_type.start_with?("image/")

    format_param = URI.decode_www_form(uri.query.to_s).to_h["format"].to_s.downcase
    ext = format_param.presence || File.extname(uri.path.to_s).delete_prefix(".").downcase

    case ext
    when "png"
      "image/png"
    when "webp"
      "image/webp"
    when "gif"
      "image/gif"
    when "heic"
      "image/heic"
    when "heif"
      "image/heif"
    else
      "image/jpeg"
    end
  end
end
