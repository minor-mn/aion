namespace :push do
  desc "Check Web Push configuration"
  task check: :environment do
    puts "=== Web Push設定診断 ==="
    puts ""

    vapid_public = ENV["VAPID_PUBLIC_KEY"]
    vapid_private = ENV["VAPID_PRIVATE_KEY"]

    if vapid_public.present?
      puts "✅ VAPID_PUBLIC_KEY: #{vapid_public[0..20]}..."
    else
      puts "❌ VAPID_PUBLIC_KEY が設定されていません"
    end

    if vapid_private.present?
      puts "✅ VAPID_PRIVATE_KEY: (設定済み)"
    else
      puts "❌ VAPID_PRIVATE_KEY が設定されていません"
    end

    puts ""
    puts "Push subscription数: #{PushSubscription.count}"
    User.joins(:push_subscriptions).distinct.each do |user|
      count = user.push_subscriptions.count
      puts "  ID=#{user.id} email=#{user.email} subscriptions=#{count}"
    end

    puts ""
    puts "=== 診断完了 ==="
  end

  desc "Send a test push notification. Usage: rails push:test[user_id,message]"
  task :test, [ :user_id, :message ] => :environment do |_t, args|
    user_id = args[:user_id]
    message = args[:message] || "テスト通知です"

    unless user_id
      puts "Usage: rails push:test[user_id,message]"
      puts "  user_id: User ID to send notification to"
      puts "  message: Notification body (default: テスト通知です)"
      puts ""
      puts "登録済みユーザー一覧:"
      User.joins(:push_subscriptions).distinct.each do |user|
        count = user.push_subscriptions.count
        puts "  ID=#{user.id} email=#{user.email} subscriptions=#{count}"
      end
      exit 1
    end

    user = User.find_by(id: user_id)
    unless user
      puts "Error: User ID=#{user_id} が見つかりません"
      exit 1
    end

    subscriptions = user.push_subscriptions
    if subscriptions.empty?
      puts "Error: User ID=#{user_id} にPush subscriptionが登録されていません"
      puts "ブラウザでログインし、マイページで通知を有効にしてください"
      exit 1
    end

    puts "User ID=#{user_id} (#{user.email}) に通知を送信中..."
    puts "本文: #{message}"
    puts "Subscription数: #{subscriptions.count}"
    puts ""

    subscriptions.each_with_index do |sub, i|
      result = WebPushService.send_notification(sub, title: "シフト通知", body: message)
      status = result ? "成功" : "失敗"
      puts "  Subscription#{i + 1}: #{status}"
      puts "    endpoint: #{sub.endpoint[0..60]}..."
    end

    puts ""
    puts "完了"
  end

  desc "Generate new VAPID keys"
  task generate_vapid_keys: :environment do
    require "web-push"
    keys = WebPush.generate_key
    puts "VAPID_PUBLIC_KEY=#{keys.public_key}"
    puts "VAPID_PRIVATE_KEY=#{keys.private_key}"
  end
end
