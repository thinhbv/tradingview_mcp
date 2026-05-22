/**
 * Telegram Bot — Multi-user + Group Support
 *
 * PRIVATE CHAT:
 *   /start     → đăng ký nhận tín hiệu
 *   /stop      → hủy đăng ký
 *
 * GROUP CHAT:
 *   /subscribe → đăng ký group nhận alert (group admin only)
 *   /leave     → hủy đăng ký group (group admin only)
 *
 * TẤT CẢ (private + group):
 *   /scan      → quét tín hiệu ngay
 *   /news      → bản tin chứng khoán cơ bản
 *   /deepnews  → tin chuyên sâu theo mã watchlist (dùng ChatGPT)
 *   /deepnews VNM → tin chuyên sâu riêng 1 mã
 *   /vnindex   → chỉ số thị trường ngay
 *   /list      → xem watchlist
 *   /watch     → thêm mã
 *   /unwatch   → xóa mã
 *   /status    → trạng thái bot
 *   /help      → hướng dẫn
 *
 * ADMIN (chỉ owner):
 *   /members   → xem tất cả subscriber
 *   /broadcast → gửi thông báo đến tất cả
 */

import TelegramBot from 'node-telegram-bot-api';
import { config }  from './config.js';
import { fetchAllIndices, formatIndicesMessage } from './news/market_indices.js';
import { scanAll, isMarketOpen, getScanState, setScanEnabled, setScanInterval } from './scanner.js';
import { formatSignalMessage, formatScanSummary } from './formatter.js';
import {
  loadSubscribers, addSubscriber, removeSubscriber,
  getAllSubscribers, getCount,
} from './subscribers.js';
import { sendMorningDigest, sendDeepNews } from './news/scheduler.js';
import { setEnvValue } from './env_writer.js';

let bot        = null;
let watchlist  = [...config.scanner.watchlist];
let isScanning = false;

const ADMIN_ID = Number(process.env.TELEGRAM_CHAT_ID);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Loại bỏ @botname suffix trong group (vd: /scan@mybot → /scan) */
function parseCommand(text = '') {
  return text.split('@')[0].toLowerCase();
}

/** Kiểm tra có phải group/supergroup không */
function isGroup(msg) {
  return msg.chat.type === 'group' || msg.chat.type === 'supergroup';
}

/** Lấy tên hiển thị cho group hoặc user */
function getChatName(msg) {
  if (isGroup(msg)) return msg.chat.title || 'Group';
  return [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || 'User';
}

/**
 * Kiểm tra người gửi có phải admin của group không
 * Trả về true nếu là owner bot hoặc admin/creator của group
 */
async function isGroupAdmin(bot, chatId, userId) {
  if (userId === ADMIN_ID) return true;
  try {
    const member = await bot.getChatMember(chatId, userId);
    return ['administrator', 'creator'].includes(member.status);
  } catch {
    return false;
  }
}

// ─── Bot Init ────────────────────────────────────────────────────────────────

export function createBot() {
  if (!config.telegram.token) {
    throw new Error('TELEGRAM_TOKEN chưa được cấu hình trong file .env');
  }

  loadSubscribers();

  // Tự động thêm admin
  if (ADMIN_ID) addSubscriber(ADMIN_ID, { name: 'Admin', username: '', type: 'private' });

  bot = new TelegramBot(config.telegram.token, { polling: true });

  // ── Command menu cho private chat ─────────────────────────────────────────
  bot.setMyCommands([
    { command: 'start',     description: '🔔 Đăng ký nhận tín hiệu MUA/BÁN' },
    { command: 'stop',      description: '🔕 Hủy nhận tín hiệu' },
    { command: 'scan',      description: '🔍 Quét tín hiệu ngay bây giờ' },
    { command: 'news',      description: '📰 Bản tin chứng khoán cơ bản' },
    { command: 'deepnews',  description: '🔬 Tin chuyên sâu theo watchlist (ChatGPT)' },
    { command: 'vnindex',   description: '📊 Chỉ số VN-Index, HNX, UPCOM ngay' },
    { command: 'list',      description: '📋 Xem danh sách mã đang theo dõi' },
    { command: 'watch',     description: '➕ Thêm mã — VD: /watch VNM' },
    { command: 'unwatch',   description: '➖ Xóa mã — VD: /unwatch VNM' },
    { command: 'status',    description: '⚙️ Trạng thái bot & thị trường' },
    { command: 'help',      description: '📖 Hướng dẫn đọc tín hiệu' },
  ], { scope: { type: 'all_private_chats' } }).catch(() => {});

  // ── Command menu cho group ─────────────────────────────────────────────────
  bot.setMyCommands([
    { command: 'subscribe',  description: '🔔 Đăng ký group nhận tín hiệu tự động' },
    { command: 'leave',      description: '🔕 Hủy đăng ký group' },
    { command: 'scan',       description: '🔍 Quét tín hiệu ngay bây giờ' },
    { command: 'news',       description: '📰 Bản tin chứng khoán cơ bản' },
    { command: 'deepnews',   description: '🔬 Tin chuyên sâu theo watchlist (ChatGPT)' },
    { command: 'vnindex',    description: '📊 Chỉ số VN-Index, HNX, UPCOM ngay' },
    { command: 'list',       description: '📋 Xem danh sách mã đang theo dõi' },
    { command: 'watch',      description: '➕ Thêm mã — VD: /watch VNM' },
    { command: 'unwatch',    description: '➖ Xóa mã — VD: /unwatch VNM' },
    { command: 'status',     description: '⚙️ Trạng thái bot & thị trường' },
    { command: 'help',       description: '📖 Hướng dẫn đọc tín hiệu' },
  ], { scope: { type: 'all_group_chats' } }).catch(() => {});

  // ── Command menu admin ─────────────────────────────────────────────────────
  if (ADMIN_ID) {
    bot.setMyCommands([
      { command: 'start',     description: '🔔 Đăng ký nhận tín hiệu MUA/BÁN' },
      { command: 'stop',      description: '🔕 Hủy nhận tín hiệu' },
      { command: 'scan',      description: '🔍 Quét tín hiệu ngay bây giờ' },
      { command: 'news',      description: '📰 Bản tin chứng khoán cơ bản' },
      { command: 'deepnews',  description: '🔬 Tin chuyên sâu theo watchlist (ChatGPT)' },
      { command: 'vnindex',   description: '📊 Chỉ số VN-Index, HNX, UPCOM ngay' },
      { command: 'list',      description: '📋 Xem danh sách mã đang theo dõi' },
      { command: 'watch',     description: '➕ Thêm mã' },
      { command: 'unwatch',   description: '➖ Xóa mã' },
      { command: 'status',    description: '⚙️ Trạng thái bot' },
      { command: 'members',   description: '👥 [Admin] Xem danh sách subscriber' },
      { command: 'broadcast', description: '📢 [Admin] Gửi thông báo đến tất cả' },
      { command: 'morning',   description: '⚙️ [Admin] Bật/tắt bản tin sáng tự động' },
      { command: 'autoscan',  description: '🔄 [Admin] Bật/tắt/đặt lịch auto-scan' },
      { command: 'help',      description: '📖 Hướng dẫn' },
    ], { scope: { type: 'chat', chat_id: ADMIN_ID } }).catch(() => {});
  }

  console.log('[Bot] 🤖 Telegram bot đã khởi động');

  // ════════════════════════════════════════════════════════════════════════════
  // PRIVATE CHAT COMMANDS
  // ════════════════════════════════════════════════════════════════════════════

  // ── /start (private) — Đăng ký ────────────────────────────────────────────
  bot.onText(/\/start(@\S+)?$/, (msg) => {
    if (isGroup(msg)) return; // group dùng /subscribe thay thế

    const chatId   = msg.chat.id;
    const name     = getChatName(msg);
    const username = msg.from?.username || '';
    const isNew    = addSubscriber(chatId, { name, username, type: 'private' });

    const oh = config.scanner.marketOpenHour,  om = String(config.scanner.marketOpenMinute  ?? 0).padStart(2,'0');
    const ch = config.scanner.marketCloseHour, cm = String(config.scanner.marketCloseMinute ?? 0).padStart(2,'0');

    bot.sendMessage(chatId, `
${isNew ? `👋 Chào *${name}*! Đăng ký thành công! 🎉` : `👋 Chào lại *${name}*! Bạn đã đăng ký rồi.`}

🤖 *TradingView Signal Bot*
━━━━━━━━━━━━━━━━━━━
📡 Nguồn: TradingView Desktop (realtime)
⏰ Giờ giao dịch: ${oh}:${om} – ${ch}:${cm} (T2–T6)
🔄 Tự động scan mỗi ${config.scanner.intervalMs / 60000} phút
👥 Đang có *${getCount()} người* đăng ký

Gõ /scan để quét ngay, /help để xem hướng dẫn.
    `.trim(), { parse_mode: 'Markdown' });

    if (isNew && chatId !== ADMIN_ID) {
      sendToAdmin(`👤 *Người mới đăng ký!*\n${name}${username ? ` (@${username})` : ''}\nID: \`${chatId}\`\nTổng: ${getCount()} người`);
    }
  });

  // ── /stop (private) — Hủy đăng ký ────────────────────────────────────────
  bot.onText(/\/stop(@\S+)?$/, (msg) => {
    if (isGroup(msg)) return;

    const chatId  = msg.chat.id;
    const removed = removeSubscriber(chatId);
    if (removed) {
      bot.sendMessage(chatId, `🔕 Đã hủy đăng ký. Bạn sẽ không nhận tín hiệu nữa.\n\nGõ /start để đăng ký lại.`);
      sendToAdmin(`👤 *${getChatName(msg)}* (ID: \`${chatId}\`) hủy đăng ký.\nCòn lại: ${getCount()} người`);
    } else {
      bot.sendMessage(chatId, `ℹ️ Bạn chưa đăng ký. Gõ /start để bắt đầu.`);
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // GROUP COMMANDS
  // ════════════════════════════════════════════════════════════════════════════

  // ── /subscribe (group) — Đăng ký group ────────────────────────────────────
  bot.onText(/\/subscribe(@\S+)?$/, async (msg) => {
    if (!isGroup(msg)) {
      bot.sendMessage(msg.chat.id, `ℹ️ Trong chat riêng, dùng /start để đăng ký nhé!`);
      return;
    }

    const chatId   = msg.chat.id;
    const groupName = msg.chat.title || 'Group';
    const userId   = msg.from?.id;

    // Chỉ group admin mới được đăng ký
    const canDo = await isGroupAdmin(bot, chatId, userId);
    if (!canDo) {
      bot.sendMessage(chatId, `🚫 Chỉ *admin của group* mới có thể đăng ký nhận tín hiệu.`, { parse_mode: 'Markdown' });
      return;
    }

    const isNew = addSubscriber(chatId, { name: groupName, username: '', type: 'group' });

    if (isNew) {
      bot.sendMessage(chatId, `
✅ *Group "${groupName}" đã đăng ký thành công!*

Từ giờ, tất cả thành viên trong group sẽ nhận tín hiệu MUA/BÁN tự động mỗi ${config.scanner.intervalMs / 60000} phút trong giờ giao dịch.

Dùng /scan để quét ngay, /help để xem hướng dẫn.
      `.trim(), { parse_mode: 'Markdown' });

      sendToAdmin(`🏘️ *Group mới đăng ký!*\nTên: ${groupName}\nID: \`${chatId}\`\nTổng subscriber: ${getCount()}`);
    } else {
      bot.sendMessage(chatId, `ℹ️ Group này đã đăng ký rồi. Dùng /leave để hủy.`);
    }
  });

  // ── /leave (group) — Hủy đăng ký group ───────────────────────────────────
  bot.onText(/\/leave(@\S+)?$/, async (msg) => {
    if (!isGroup(msg)) return;

    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    const canDo = await isGroupAdmin(bot, chatId, userId);
    if (!canDo) {
      bot.sendMessage(chatId, `🚫 Chỉ *admin của group* mới có thể hủy đăng ký.`, { parse_mode: 'Markdown' });
      return;
    }

    const removed = removeSubscriber(chatId);
    if (removed) {
      bot.sendMessage(chatId, `🔕 Group đã hủy đăng ký. Sẽ không nhận tín hiệu tự động nữa.\n\nDùng /subscribe để đăng ký lại.`);
    } else {
      bot.sendMessage(chatId, `ℹ️ Group chưa đăng ký. Dùng /subscribe để bắt đầu.`);
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SHARED COMMANDS (private + group)
  // ════════════════════════════════════════════════════════════════════════════

  // ── /scan ──────────────────────────────────────────────────────────────────
  bot.onText(/\/scan(@\S+)?$/, async (msg) => {
    const chatId = msg.chat.id;

    if (isScanning) {
      bot.sendMessage(chatId, '⏳ Đang scan... vui lòng chờ kết quả.');
      return;
    }

    isScanning = true;
    await bot.sendMessage(chatId, `🔍 Đang quét *${watchlist.length} mã*... ⏳`, { parse_mode: 'Markdown' });

    try {
      const results = await scanAll(watchlist);
      const summary = formatScanSummary(results);
      await bot.sendMessage(chatId, summary, { parse_mode: 'Markdown' });
    } catch (err) {
      await bot.sendMessage(chatId, `❌ Lỗi scan: ${err.message}`);
    } finally {
      isScanning = false;
    }
  });

  // ── /news — Xem bản tin ngay ──────────────────────────────────────────────
  bot.onText(/\/news(@\S+)?$/, async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId, `📰 Đang tổng hợp tin tức... ⏳\n_Vui lòng chờ 15-20 giây_`, { parse_mode: 'Markdown' });
    await sendMorningDigest(
      (message) => bot.sendMessage(chatId, message, { parse_mode: 'Markdown' }).catch(() => {}),
      watchlist
    );
  });

  // ── /deepnews [SYMBOL] — Tin chuyên sâu theo mã ──────────────────────────
  bot.onText(/\/deepnews(?:@\S+)?(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const rawArg = match[1]?.trim().toUpperCase();

    if (rawArg) {
      // /deepnews SHB — tin cho 1 mã cụ thể
      const symbol = rawArg.includes(':') ? rawArg : rawArg;
      await sendDeepNews(symbol, (message) =>
        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' }).catch(() => {})
      );
    } else {
      // /deepnews — tin cho tất cả mã trong watchlist
      if (watchlist.length === 0) {
        bot.sendMessage(chatId, `⚠️ Watchlist trống. Dùng /watch SHB để thêm mã.`);
        return;
      }
      await bot.sendMessage(chatId,
        `🔬 Đang tìm tin chuyên sâu cho *${watchlist.length} mã*... ⏳`,
        { parse_mode: 'Markdown' }
      );
      for (const sym of watchlist) {
        await sendDeepNews(sym, (message) =>
          bot.sendMessage(chatId, message, { parse_mode: 'Markdown' }).catch(() => {})
        );
        await new Promise(r => setTimeout(r, 1500));
      }
    }
  });

  // ── /vnindex — Xem chỉ số thị trường ngay ────────────────────────────────
  bot.onText(/\/vnindex(@\S+)?$/, async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId, `📊 Đang lấy chỉ số thị trường... ⏳`, { parse_mode: 'Markdown' });
    try {
      const indices = await fetchAllIndices();
      await bot.sendMessage(chatId, formatIndicesMessage(indices), { parse_mode: 'Markdown' });
    } catch (err) {
      await bot.sendMessage(chatId, `❌ Lỗi: ${err.message}`);
    }
  });

  // ── /watch <symbol> ────────────────────────────────────────────────────────
  bot.onText(/\/watch(?:@\S+)? (.+)/, (msg, match) => {
    const chatId     = msg.chat.id;
    const raw        = match[1].trim().toUpperCase();
    const fullSymbol = raw.includes(':') ? raw : `HOSE:${raw}`;

    if (watchlist.includes(fullSymbol)) {
      bot.sendMessage(chatId, `⚠️ *${fullSymbol}* đã có trong watchlist.`, { parse_mode: 'Markdown' });
    } else {
      watchlist.push(fullSymbol);
      bot.sendMessage(chatId, `✅ Đã thêm *${fullSymbol}* — Watchlist: ${watchlist.length} mã`, { parse_mode: 'Markdown' });
    }
  });

  // ── /unwatch <symbol> ──────────────────────────────────────────────────────
  bot.onText(/\/unwatch(?:@\S+)? (.+)/, (msg, match) => {
    const chatId     = msg.chat.id;
    const raw        = match[1].trim().toUpperCase();
    const fullSymbol = raw.includes(':') ? raw : `HOSE:${raw}`;
    const before     = watchlist.length;

    watchlist = watchlist.filter(s => s !== fullSymbol);
    if (watchlist.length < before) {
      bot.sendMessage(chatId, `🗑️ Đã xóa *${fullSymbol}* — Watchlist: ${watchlist.length} mã`, { parse_mode: 'Markdown' });
    } else {
      bot.sendMessage(chatId, `⚠️ Không thấy *${fullSymbol}* trong watchlist.`, { parse_mode: 'Markdown' });
    }
  });

  // ── /list ──────────────────────────────────────────────────────────────────
  bot.onText(/\/list(@\S+)?$/, (msg) => {
    const list = watchlist.map((s, i) => `${i + 1}. ${s}`).join('\n');
    bot.sendMessage(msg.chat.id,
      `📋 *Watchlist (${watchlist.length} mã):*\n${list}\n\n/watch VNM — thêm\n/unwatch VNM — xóa`,
      { parse_mode: 'Markdown' }
    );
  });

  // ── /status ────────────────────────────────────────────────────────────────
  bot.onText(/\/status(@\S+)?$/, (msg) => {
    const marketStr = isMarketOpen() ? '🟢 Đang giao dịch' : '🔴 Ngoài giờ giao dịch';
    const now       = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const subs      = getAllSubscribers();
    const groups    = subs.filter(s => s.type === 'group').length;
    const privates  = subs.filter(s => s.type !== 'group').length;
    const scan      = getScanState();

    bot.sendMessage(msg.chat.id, `
⚙️ *Trạng thái Bot*
━━━━━━━━━━━
🤖 Bot: ✅ Hoạt động
👤 Cá nhân: *${privates} người*
🏘️ Group: *${groups} nhóm*
📊 Watchlist: ${watchlist.length} mã
🕐 Thị trường: ${marketStr}
⏰ Thời gian: ${now}
🔄 Auto-scan: ${scan.enabled ? `✅ BẬT` : `❌ TẮT`} — mỗi *${scan.intervalMs / 60000} phút*
    `.trim(), { parse_mode: 'Markdown' });
  });

  // ── /help ──────────────────────────────────────────────────────────────────
  bot.onText(/\/help(@\S+)?$/, (msg) => {
    const groupExtra = isGroup(msg) ? `
*Lệnh Group:*
/subscribe — Đăng ký group nhận alert _(chỉ admin group)_
/leave — Hủy đăng ký group _(chỉ admin group)_
` : `
*Lệnh cá nhân:*
/start — Đăng ký nhận tín hiệu
/stop — Hủy nhận tín hiệu
`;

    bot.sendMessage(msg.chat.id, `
📖 *Hướng dẫn sử dụng*
━━━━━━━━━━━━━━━━━━━
${groupExtra}
*Tin tức:*
/news — Bản tin chứng khoán cơ bản (CafeF + VnExpress)
/deepnews — Tin chuyên sâu theo watchlist (ChatGPT)
/deepnews VNM — Tin chuyên sâu riêng 1 mã
/vnindex — Chỉ số VN-Index, HNX, UPCOM ngay

*Tín hiệu kỹ thuật:*
/scan — Quét toàn bộ watchlist ngay
/list — Xem danh sách mã đang theo dõi
/watch VNM — Thêm mã vào watchlist
/unwatch VNM — Xóa mã khỏi watchlist

*Loại tín hiệu:*
🔥🟢 *STRONG BUY* — Mua mạnh
✅ *BUY* — Nên mua
🔥🔴 *STRONG SELL* — Bán mạnh
🔴 *SELL* — Nên bán/chốt lời
👀 *WATCH* — Theo dõi thêm

*Cách đọc:*
• Vị trí range 60p: 0% = đáy, 100% = đỉnh
• KL Ratio >1.3x = khối lượng bất thường
• Điểm cao = tín hiệu đáng tin hơn

⚠️ Phân tích kỹ thuật, không phải tư vấn tài chính.
    `.trim(), { parse_mode: 'Markdown' });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // ADMIN COMMANDS
  // ════════════════════════════════════════════════════════════════════════════

  // ── /members (admin) ───────────────────────────────────────────────────────
  bot.onText(/\/members(@\S+)?$/, (msg) => {
    if (msg.chat.id !== ADMIN_ID) {
      bot.sendMessage(msg.chat.id, `🚫 Lệnh này chỉ dành cho admin.`);
      return;
    }

    const subs = getAllSubscribers();
    if (subs.length === 0) {
      bot.sendMessage(ADMIN_ID, `📭 Chưa có ai đăng ký.`);
      return;
    }

    const groups   = subs.filter(s => s.type === 'group');
    const privates = subs.filter(s => s.type !== 'group');

    let msg2 = `👥 *Tất cả subscriber (${subs.length}):*\n\n`;

    if (privates.length > 0) {
      msg2 += `👤 *Cá nhân (${privates.length}):*\n`;
      msg2 += privates.map((s, i) => {
        const tag  = s.username ? `@${s.username}` : s.name;
        const date = new Date(s.joinedAt).toLocaleDateString('vi-VN');
        return `${i + 1}. ${tag} — \`${s.chatId}\` (${date})`;
      }).join('\n');
      msg2 += '\n\n';
    }

    if (groups.length > 0) {
      msg2 += `🏘️ *Group (${groups.length}):*\n`;
      msg2 += groups.map((s, i) => {
        const date = new Date(s.joinedAt).toLocaleDateString('vi-VN');
        return `${i + 1}. ${s.name} — \`${s.chatId}\` (${date})`;
      }).join('\n');
    }

    bot.sendMessage(ADMIN_ID, msg2, { parse_mode: 'Markdown' });
  });

  // ── /morning [on|off] [news|deepnews|vnindex] (admin) ────────────────────
  bot.onText(/\/morning(?:@\S+)?(?:\s+(.+))?/, (msg, match) => {
    if (msg.chat.id !== ADMIN_ID) {
      bot.sendMessage(msg.chat.id, `🚫 Lệnh này chỉ dành cho admin.`);
      return;
    }

    const arg = match[1]?.trim().toLowerCase();

    // Không có arg → hiển thị trạng thái hiện tại
    if (!arg) {
      const s = config.morning;
      bot.sendMessage(ADMIN_ID,
        `⚙️ *Bản tin sáng tự động (9:00 T2-T6)*\n\n` +
        `📰 Tin cơ bản: ${s.basicNews ? '✅ BẬT' : '❌ TẮT'}\n` +
        `🔬 Tin chuyên sâu: ${s.deepNews ? '✅ BẬT' : '❌ TẮT'}\n` +
        `📊 VNIndex: ${s.vnindex ? '✅ BẬT' : '❌ TẮT'}\n\n` +
        `_Lệnh:_\n` +
        `/morning on news — bật tin cơ bản\n` +
        `/morning off news — tắt tin cơ bản\n` +
        `/morning on deepnews — bật tin chuyên sâu\n` +
        `/morning off deepnews — tắt tin chuyên sâu\n` +
        `/morning on vnindex — bật VNIndex\n` +
        `/morning off vnindex — tắt VNIndex`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const parts  = arg.split(/\s+/);
    const action = parts[0]; // on | off
    const target = parts[1]; // news | deepnews | vnindex

    if (!['on', 'off'].includes(action) || !['news', 'deepnews', 'vnindex'].includes(target)) {
      bot.sendMessage(ADMIN_ID,
        `⚠️ Cú pháp: /morning [on|off] [news|deepnews|vnindex]\nVD: /morning on deepnews`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const val    = action === 'on';
    const envMap = { news: 'MORNING_BASIC_NEWS', deepnews: 'MORNING_DEEP_NEWS', vnindex: 'MORNING_VNINDEX' };
    setEnvValue(envMap[target], val);

    const label = { news: '📰 Tin cơ bản', deepnews: '🔬 Tin chuyên sâu', vnindex: '📊 VNIndex' };
    bot.sendMessage(ADMIN_ID,
      `${val ? '✅' : '❌'} *${label[target]}* đã ${val ? 'BẬT' : 'TẮT'} trong bản tin sáng.\n_Đã lưu vào .env — giữ nguyên sau khi restart._\n\n` +
      `/morning — xem trạng thái`,
      { parse_mode: 'Markdown' }
    );
  });

  // ── /autoscan [on|off|interval <phút>] (admin) ───────────────────────────
  bot.onText(/\/autoscan(?:@\S+)?(?:\s+(.+))?/, (msg, match) => {
    if (msg.chat.id !== ADMIN_ID) {
      bot.sendMessage(msg.chat.id, `🚫 Lệnh này chỉ dành cho admin.`);
      return;
    }

    const arg = match[1]?.trim().toLowerCase();
    const scan = getScanState();

    if (!arg) {
      bot.sendMessage(ADMIN_ID,
        `🔄 *Auto-scan hiện tại*\n\n` +
        `Trạng thái: ${scan.enabled ? '✅ BẬT' : '❌ TẮT'}\n` +
        `Chu kỳ: *${scan.intervalMs / 60000} phút*\n\n` +
        `_Lệnh:_\n` +
        `/autoscan on — bật auto-scan\n` +
        `/autoscan off — tắt auto-scan\n` +
        `/autoscan interval 15 — đặt chu kỳ 15 phút`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    if (arg === 'on') {
      setScanEnabled(true);
      bot.sendMessage(ADMIN_ID, `✅ *Auto-scan đã BẬT* — sẽ quét mỗi ${getScanState().intervalMs / 60000} phút trong giờ giao dịch.`, { parse_mode: 'Markdown' });
      return;
    }

    if (arg === 'off') {
      setScanEnabled(false);
      bot.sendMessage(ADMIN_ID, `❌ *Auto-scan đã TẮT* — dùng /autoscan on để bật lại.`, { parse_mode: 'Markdown' });
      return;
    }

    const parts = arg.split(/\s+/);
    if (parts[0] === 'interval' && parts[1]) {
      const minutes = parseFloat(parts[1]);
      if (isNaN(minutes) || minutes < 1 || minutes > 1440) {
        bot.sendMessage(ADMIN_ID, `⚠️ Chu kỳ phải từ 1 đến 1440 phút.\nVD: /autoscan interval 15`);
        return;
      }
      setScanInterval(Math.round(minutes * 60000));
      bot.sendMessage(ADMIN_ID,
        `⏱️ *Chu kỳ scan đã đổi thành ${minutes} phút.*\n_Có hiệu lực từ lần scan tiếp theo._`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    bot.sendMessage(ADMIN_ID,
      `⚠️ Cú pháp không hợp lệ.\n/autoscan on | off | interval <phút>\nVD: /autoscan interval 15`
    );
  });

  // ── /broadcast <message> (admin) ──────────────────────────────────────────
  bot.onText(/\/broadcast(?:@\S+)? (.+)/, async (msg, match) => {
    if (msg.chat.id !== ADMIN_ID) {
      bot.sendMessage(msg.chat.id, `🚫 Lệnh này chỉ dành cho admin.`);
      return;
    }

    const text = match[1].trim();
    const subs = getAllSubscribers();

    await bot.sendMessage(ADMIN_ID, `📢 Đang gửi đến ${subs.length} subscriber...`);

    let ok = 0, fail = 0;
    for (const sub of subs) {
      try {
        await bot.sendMessage(sub.chatId, `📢 *Thông báo:*\n\n${text}`, { parse_mode: 'Markdown' });
        ok++;
      } catch (err) {
        fail++;
        if (err.response?.statusCode === 403) removeSubscriber(sub.chatId);
      }
    }

    bot.sendMessage(ADMIN_ID, `✅ Đã gửi: ${ok} thành công, ${fail} thất bại.`);
  });

  // ── Khi bot được thêm vào group — tự hỏi về đăng ký ──────────────────────
  bot.on('new_chat_members', (msg) => {
    const botAdded = msg.new_chat_members?.some(m => m.is_bot && m.username === bot.options?.username);
    if (botAdded) {
      bot.sendMessage(msg.chat.id, `
👋 Xin chào *${msg.chat.title}*!

Tôi là *TradingView Signal Bot* — tự động gửi tín hiệu MUA/BÁN cổ phiếu VN.

Để group nhận tín hiệu tự động, admin group gõ:
👉 /subscribe

Xem thêm: /help
      `.trim(), { parse_mode: 'Markdown' });
    }
  });

  return bot;
}

// ─────────────────────────────────────────────────────────────────────────────

/** Gửi alert đến TẤT CẢ subscriber (cá nhân + group) */
export function sendAlert(message) {
  if (!bot) return;
  const subs = getAllSubscribers();
  if (subs.length === 0) { console.warn('[Bot] Không có subscriber'); return; }

  console.log(`[Bot] 📢 Gửi alert đến ${subs.length} subscriber...`);
  for (const sub of subs) {
    bot.sendMessage(sub.chatId, message, { parse_mode: 'Markdown' })
      .catch(err => {
        if (err.response?.statusCode === 403) {
          console.log(`[Bot] 🚫 ${sub.chatId} block bot — tự xóa`);
          removeSubscriber(sub.chatId);
        }
      });
  }
}

/** Gửi tin riêng cho admin */
export function sendToAdmin(message) {
  if (!bot || !ADMIN_ID) return;
  bot.sendMessage(ADMIN_ID, message, { parse_mode: 'Markdown' }).catch(() => {});
}

export function getWatchlist() { return watchlist; }
