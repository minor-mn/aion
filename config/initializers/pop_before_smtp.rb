# frozen_string_literal: true

# POP before SMTP interceptor
#
# Some SMTP servers require POP3 authentication before allowing
# SMTP relay (POP-before-SMTP). This interceptor performs a POP3
# login before each mail delivery when POP_ADDRESS is configured.
#
# Required environment variables:
#   POP_ADDRESS  - POP3 server hostname
#   POP_USERNAME - POP3 login username
#   POP_PASSWORD - POP3 login password
#
# Optional environment variables:
#   POP_PORT       - POP3 port (default: 110, or 995 for SSL)
#   POP_ENABLE_SSL - "true" to use POP3S (default: "false")

require "net/pop"

class PopBeforeSmtpInterceptor
  def self.delivering_email(_message)
    pop_address = ENV["POP_ADDRESS"]
    return if pop_address.blank?

    pop_port    = ENV.fetch("POP_PORT", ENV.fetch("POP_ENABLE_SSL", "false") == "true" ? 995 : 110).to_i
    pop_user    = ENV.fetch("POP_USERNAME", "")
    pop_pass    = ENV.fetch("POP_PASSWORD", "")
    use_ssl     = ENV.fetch("POP_ENABLE_SSL", "false") == "true"

    pop = Net::POP3.new(pop_address, pop_port)
    pop.enable_ssl if use_ssl

    begin
      Rails.logger.info(
        "[POP before SMTP] Starting POP3 auth " \
        "address=#{pop_address} port=#{pop_port} ssl=#{use_ssl} user=#{masked_user(pop_user)}"
      )
      pop.start(pop_user, pop_pass)
      pop.finish
      Rails.logger.info("[POP before SMTP] POP3 auth succeeded")
    rescue OpenSSL::SSL::SSLError => e
      Rails.logger.error("[POP before SMTP] SSL error — check POP_ENABLE_SSL and POP_PORT settings: #{e.message}")
      raise
    rescue Net::POPError => e
      Rails.logger.error("[POP before SMTP] POP3 authentication failed: #{e.message}")
      raise
    rescue StandardError => e
      Rails.logger.error("[POP before SMTP] Unexpected error: #{e.class}: #{e.message}")
      raise
    end
  end

  def self.masked_user(value)
    return "(none)" if value.blank?

    "#{value[0, 2]}***"
  end
end

if ENV["POP_ADDRESS"].present?
  ActionMailer::Base.register_interceptor(PopBeforeSmtpInterceptor)
  Rails.logger.info("[POP before SMTP] Enabled — POP3 server: #{ENV['POP_ADDRESS']}")
end
