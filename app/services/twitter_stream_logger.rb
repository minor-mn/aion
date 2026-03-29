class TwitterStreamLogger
  class << self
    def logger
      @logger ||= begin
        path = Rails.root.join("log/twitter-stream.log")
        logger = Logger.new(path, 10, 10.megabytes)
        logger.level = Logger::INFO
        logger.formatter = proc do |severity, datetime, _progname, message|
          "#{datetime.iso8601} #{severity} #{message}\n"
        end
        logger
      end
    end

    def info(message)
      logger.info(message)
    end

    def error(message)
      logger.error(message)
    end

    def warn(message)
      logger.warn(message)
    end
  end
end
