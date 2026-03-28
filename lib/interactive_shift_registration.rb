# frozen_string_literal: true

require "time"

class InteractiveShiftRegistration
  ShiftDraft = Struct.new(:start_at, :end_at, :source_line, keyword_init: true)

  def run
    ensure_interactive!

    shop = select_shop
    staff = select_staff(shop)
    drafts = collect_shift_drafts

    puts
    puts "登録対象:"
    puts "店舗: #{shop.name}"
    puts "キャスト: #{staff.name}"
    drafts.each_with_index do |draft, index|
      puts format("%2d. %s - %s", index + 1, draft.start_at.strftime("%Y-%m-%d %H:%M"), draft.end_at.strftime("%Y-%m-%d %H:%M"))
    end
    puts

    return puts("キャンセルしました") unless confirm?("この内容で登録しますか? [y/N]: ")

    created = []
    errors = []

    StaffShift.transaction do
      drafts.each do |draft|
        shift = StaffShift.new(
          shop: shop,
          staff: staff,
          start_at: draft.start_at,
          end_at: draft.end_at
        )

        if shift.save
          created << shift
        else
          errors << "#{draft.source_line} -> #{shift.errors.full_messages.join(', ')}"
        end
      end

      raise ActiveRecord::Rollback if errors.any?
    end

    if errors.any?
      puts "登録に失敗しました:"
      errors.each { |error| puts "- #{error}" }
      return
    end

    puts "#{created.size}件登録しました"
  end

  private

  def ensure_interactive!
    raise "TTY で実行してください" unless $stdin.tty?
  end

  def select_shop
    shops = Shop.order(:name).to_a
    raise "店舗が登録されていません" if shops.empty?

    puts "店舗を選択してください:"
    shops.each_with_index do |shop, index|
      puts format("%2d. %s", index + 1, shop.name)
    end

    shops[ask_index(shops.size, "店舗番号: ")]
  end

  def select_staff(shop)
    staffs = shop.staffs.order(:name).to_a
    raise "#{shop.name} にはキャストが登録されていません" if staffs.empty?

    puts
    puts "キャストを選択してください:"
    staffs.each_with_index do |staff, index|
      puts format("%2d. %s", index + 1, staff.name)
    end

    staffs[ask_index(staffs.size, "キャスト番号: ")]
  end

  def collect_shift_drafts
    puts
    puts "シフトを複数行で貼り付けてください。空行で終了します。"
    puts "例: 2026.4.1 17:00 - 23:00"

    lines = []
    loop do
      print "> "
      line = $stdin.gets
      break if line.nil?

      line = line.strip
      break if line.empty?

      lines << line
    end

    raise "シフトが入力されていません" if lines.empty?

    lines.map { |line| parse_shift_line(line) }
  end

  def parse_shift_line(line)
    match = line.match(/\A(?<year>\d{4})[.\/-](?<month>\d{1,2})[.\/-](?<day>\d{1,2})\s+(?<start_hour>\d{1,2}):(?<start_minute>\d{2})\s*-\s*(?<end_hour>\d{1,2}):(?<end_minute>\d{2})\z/)
    raise "解釈できない行です: #{line}" unless match

    start_at = Time.zone.local(
      match[:year].to_i,
      match[:month].to_i,
      match[:day].to_i,
      match[:start_hour].to_i,
      match[:start_minute].to_i
    )
    end_at = Time.zone.local(
      match[:year].to_i,
      match[:month].to_i,
      match[:day].to_i,
      match[:end_hour].to_i,
      match[:end_minute].to_i
    )
    end_at += 1.day if end_at <= start_at

    ShiftDraft.new(start_at: start_at, end_at: end_at, source_line: line)
  end

  def ask_index(size, prompt)
    loop do
      print prompt
      input = $stdin.gets&.strip
      raise "入力が中断されました" if input.nil?

      value = Integer(input, exception: false)
      return value - 1 if value && value.between?(1, size)

      puts "1から#{size}の番号を入力してください"
    end
  end

  def confirm?(prompt)
    print prompt
    answer = $stdin.gets&.strip
    answer.to_s.downcase == "y"
  end
end
