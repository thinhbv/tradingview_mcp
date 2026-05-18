/**
 * TradingView → Telegram Signal Bot
 * Entry point — chạy: node telegram/index.js
 *
 * Yêu cầu:
 *   1. TradingView Desktop đang chạy với --remote-debugging-port=9222
 *   2. File .env đã có TELEGRAM_TOKEN và TELEGRAM_CHAT_ID
 *   3. npm install node-telegram-bot-api dotenv
 */

import 'dotenv/config';
import { createBot, sendAlert, getWatchlist } from './bot.js';
import { startAutoScanner } from './scanner.js';
import { formatSignalMessage } from './formatter.js';
import { config } from './config.js';
import { startNewsScheduler } from './news/scheduler.js';

// ─── Validate cấu hình ───────────────────────────────────────────────────────

if (!process.env.TELEGRAM_TOKEN) {
  console.error('❌ Thiếu TELEGRAM_TOKEN trong file .env');
  console.error('   Tạo bot tại @BotFather và điền token vào .env');
  process.exit(1);
}

if (!process.env.TELEGRAM_CHAT_ID) {
  console.error('❌ Thiếu TELEGRAM_CHAT_ID trong file .env');
  console.error('   Gửi /start cho bot rồi mở: https://api.telegram.org/bot<TOKEN>/getUpdates');
  process.exit(1);
}

// ─── Khởi động ───────────────────────────────────────────────────────────────

console.log(`
╔══════════════════════════════════════╗
║   TradingView → Telegram Signal Bot  ║
╚══════════════════════════════════════╝
`);
console.log(`📊 Watchlist: ${config.scanner.watchlist.join(', ')}`);
console.log(`⏰ Scan interval: ${config.scanner.intervalMs / 60000} phút`);
console.log(`🕐 Giờ giao dịch: ${config.scanner.marketOpenHour}:${String(config.scanner.marketOpenMinute ?? 0).padStart(2,'0')} – ${config.scanner.marketCloseHour}:${String(config.scanner.marketCloseMinute ?? 0).padStart(2,'0')}`);
console.log(`📰 Bản tin sáng: 9:00 Thứ 2 – Thứ 6`);
console.log('');

// Khởi động Telegram bot (nhận lệnh từ user)
const bot = createBot();

// Startup notification đã tắt

// Khởi động news scheduler — bản tin sáng 9:00 T2-T6
startNewsScheduler(sendAlert, '0 9 * * 1-5');

// Khởi động auto-scanner (tự động quét và gửi tín hiệu)
startAutoScanner(
  // Callback khi có tín hiệu
  (signalResult) => {
    const message = formatSignalMessage(signalResult);
    sendAlert(message);
    console.log(`[Alert] 📢 ${signalResult.symbol}: ${signalResult.signal} (score=${signalResult.score})`);
  },
  // Hàm lấy watchlist động (có thể thay đổi qua lệnh /watch)
  getWatchlist
);

// ─── Xử lý tắt gracefully ────────────────────────────────────────────────────

process.on('SIGINT', () => {
  console.log('\n[Bot] Đang tắt...');
  sendAlert('⚠️ *Signal Bot đã tắt.* Khởi động lại để tiếp tục nhận tín hiệu.');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('[Bot] Lỗi không xử lý được:', err.message);
  sendAlert(`🚨 *Bot gặp lỗi:*\n\`${err.message}\`\n\nĐang tự khôi phục...`);
});
