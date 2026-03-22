namespace :fcm do
  desc "Send a test push notification to a user. Usage: rails fcm:test[user_id,message]"
  task :test, [:user_id, :message] => :environment do |_t, args|
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
