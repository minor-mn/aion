namespace :fcm do
  desc "Check FCM configuration"
  task check: :environment do
    puts "=== FCM設定診断 ==="
    puts ""

    value = ENV["FIREBASE_SERVICE_ACCOUNT_JSON"]
    if value.blank?
      puts "❌ FIREBASE_SERVICE_ACCOUNT_JSON が設定されていません"
      puts "   .envファイルに設定してください"
      exit 1
    end

    is_file = value.start_with?("/") || value.start_with?("./")
    if is_file
      puts "📁 ファイルパスモード: #{value}"
      unless File.exist?(value)
        puts "❌ ファイルが見つかりません: #{value}"
        exit 1
      end
      puts "✅ ファイルが存在します"
      json_content = File.read(value)
    else
      puts "📝 JSON文字列モード (#{value.length}文字)"
      json_content = value
    end

    begin
      parsed = JSON.parse(json_content)
      puts "✅ JSONパース成功"
    rescue JSON::ParserError => e
      puts "❌ JSONパースエラー: #{e.message}"
      exit 1
    end

    required_fields = %w[type project_id private_key client_email]
    required_fields.each do |field|
      if parsed[field].present?
        display = field == "private_key" ? "#{parsed[field][0..30]}..." : parsed[field]
        puts "✅ #{field}: #{display}"
      else
        puts "❌ #{field} が見つかりません"
      end
    end

    puts ""
    puts "googleauth gem version: #{Gem.loaded_specs['googleauth']&.version || 'unknown'}"
    puts ""
    puts "アクセストークン取得テスト..."
    begin
      credentials = Google::Auth::ServiceAccountCredentials.make_creds(
        json_key_io: StringIO.new(json_content),
        scope: "https://www.googleapis.com/auth/firebase.cloud-messaging"
      )
      puts "credentials class: #{credentials.class}"
      result = credentials.fetch_access_token!
      puts "fetch_access_token! 戻り値: #{result.inspect}"
      token = credentials.access_token || result["access_token"]
      if token.present?
        puts "✅ アクセストークン取得成功: #{token[0..20]}..."
      else
        puts "❌ アクセストークンが空です"
        puts "   credentials methods: #{(credentials.methods - Object.methods).sort.join(', ')}"
      end
    rescue => e
      puts "❌ アクセストークン取得失敗: #{e.class} - #{e.message}"
      puts "   #{e.backtrace&.first(3)&.join("\n   ")}"
    end

    puts ""
    puts "=== 診断完了 ==="
  end

  desc "Send a test push notification to a user. Usage: rails fcm:test[user_id,message]"
  task :test, [ :user_id, :message ] => :environment do |_t, args|
    user_id = args[:user_id]
    message = args[:message] || "テスト通知です"

    unless user_id
      puts "Usage: rails fcm:test[user_id,message]"
      puts "  user_id: User ID to send notification to"
      puts "  message: Notification body (default: テスト通知です)"
      puts ""
      puts "登録済みユーザー一覧:"
      User.joins(:fcm_tokens).distinct.each do |user|
        tokens_count = user.fcm_tokens.count
        puts "  ID=#{user.id} email=#{user.email} tokens=#{tokens_count}"
      end
      exit 1
    end

    user = User.find_by(id: user_id)
    unless user
      puts "Error: User ID=#{user_id} が見つかりません"
      exit 1
    end

    tokens = user.fcm_tokens.pluck(:token)
    if tokens.empty?
      puts "Error: User ID=#{user_id} にFCMトークンが登録されていません"
      puts "ブラウザでログインし、マイページで通知を有効にしてください"
      exit 1
    end

    puts "User ID=#{user_id} (#{user.email}) に通知を送信中..."
    puts "本文: #{message}"
    puts "トークン数: #{tokens.count}"
    puts ""

    tokens.each_with_index do |token, i|
      result = FcmService.send_notification(token, title: "シフト通知", body: message)
      status = result ? "成功" : "失敗"
      puts "  トークン#{i + 1}: #{status}"
    end

    puts ""
    puts "完了"
  end
end
