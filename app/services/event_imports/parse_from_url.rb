require "ipaddr"
require "net/http"
require "nokogiri"
require "resolv"

module EventImports
  class ParseFromUrl
    MAX_REDIRECTS = 3
    PRIVATE_RANGES = [
      IPAddr.new("127.0.0.0/8"),
      IPAddr.new("10.0.0.0/8"),
      IPAddr.new("172.16.0.0/12"),
      IPAddr.new("192.168.0.0/16"),
      IPAddr.new("169.254.0.0/16"),
      IPAddr.new("::1/128"),
      IPAddr.new("fc00::/7"),
      IPAddr.new("fe80::/10")
    ].freeze

    def initialize(url:, parser: EventImports::OpenaiEventParser.new)
      @url = url.to_s.strip
      @parser = parser
    end

    def call
      source = fetch_page(@url)
      parsed = @parser.parse_page(
        url: source[:url],
        title: source[:title],
        text: source[:text],
        image_urls: source[:image_urls] || []
      )
      {
        source_url: source[:url],
        source_title: source[:title],
        events: Array(parsed["events"]).map do |event|
          {
            title: event["title"].to_s,
            url: event["url"].presence,
            start_at: event["start_at"].to_s,
            end_at: event["end_at"].to_s
          }
        end
      }
    end

    private

    def fetch_page(raw_url, redirect_count = 0)
      raise ParameterError, "URLを入力してください" if raw_url.blank?
      raise ParameterError, "リダイレクトが多すぎます" if redirect_count > MAX_REDIRECTS

      uri = URI.parse(raw_url)
      raise ParameterError, "http(s) URLのみ対応しています" unless uri.is_a?(URI::HTTP) || uri.is_a?(URI::HTTPS)
      raise ParameterError, "ホスト名が不正です" if uri.host.blank?

      validate_public_host!(uri.host)

      request = Net::HTTP::Get.new(uri)
      request["User-Agent"] = "AionEventImporter/1.0"

      response = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https", read_timeout: 20, open_timeout: 10) do |http|
        http.request(request)
      end

      case response
      when Net::HTTPRedirection
        location = response["location"].to_s
        next_uri = URI.join(uri, location).to_s
        fetch_page(next_uri, redirect_count + 1)
      when Net::HTTPSuccess
        html = response.body.to_s
        doc = Nokogiri::HTML(html)
        {
          url: uri.to_s,
          title: extract_title(doc),
          text: extract_text(doc)
        }
      else
        raise "ページの取得に失敗しました: #{response.code}"
      end
    rescue URI::InvalidURIError
      raise ParameterError, "URLが不正です"
    rescue SocketError, Resolv::ResolvError
      raise ParameterError, "URLのホスト解決に失敗しました"
    end

    def validate_public_host!(host)
      addresses = Resolv.getaddresses(host)
      raise ParameterError, "URLのホスト解決に失敗しました" if addresses.empty?

      addresses.each do |address|
        ip = IPAddr.new(address)
        raise ParameterError, "ローカルアドレスは利用できません" if private_ip?(ip)
      end
    end

    def private_ip?(ip)
      PRIVATE_RANGES.any? { |range| range.include?(ip) }
    end

    def extract_title(doc)
      title = doc.at_css("meta[property='og:title']")&.[]("content").to_s.strip
      title = doc.at_css("title")&.text.to_s.strip if title.blank?
      title
    end

    def extract_text(doc)
      doc.css("script,style,noscript").remove

      node = doc.at_css(".news_detail .text") ||
        doc.at_css("article .text") ||
        doc.at_css("article") ||
        doc.at_css("main") ||
        doc.at_css(".news_detail") ||
        doc.at_css(".news-detail") ||
        doc.at_css("#news_detail") ||
        doc.at_css("#news-detail") ||
        doc.at_css("body")

      return "" unless node

      lines = []

      node.css("p, li").each do |element|
        text = element.text.to_s.gsub(/\u00A0/, " ").strip
        next if text.blank?

        lines << text

        element.css("a[href]").each do |link|
          href = link["href"].to_s.strip
          next if href.blank?

          absolute_href = begin
            URI.join(@url, href).to_s
          rescue StandardError
            href
          end
          lines << "LINK: #{absolute_href}"
        end
      end

      if lines.empty?
        node.text.to_s.gsub(/\s+/, " ").strip
      else
        lines.join("\n")
      end
    end
  end
end
