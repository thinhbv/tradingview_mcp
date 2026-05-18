/**
 * News Digest Formatter
 * Tổng hợp tin tức thành tin nhắn Telegram ngắn gọn, dễ đọc
 */

/**
 * Format toàn bộ digest tin tức buổi sáng
 * @param {Array} articles - Mảng bài viết từ scraper
 * @returns {string[]} - Mảng tin nhắn (chia nhỏ nếu quá dài)
 */
export function formatDailyDigest(articles) {
  const now  = new Date().toLocaleDateString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  });

  const cafef    = articles.filter(a => a.source === 'CafeF');
  const vnexpress = articles.filter(a => a.source === 'VnExpress');

  const messages = [];

  // ── Header ────────────────────────────────────────────────────────────────
  let header = `📰 *BẢN TIN CHỨNG KHOÁN SÁNG NAY*\n`;
  header    += `📅 ${now}\n`;
  header    += `━━━━━━━━━━━━━━━━━━━\n\n`;
  header    += `Tổng hợp *${articles.length} tin* từ CafeF & VnExpress 👇`;

  messages.push(header);

  // ── CafeF Section ─────────────────────────────────────────────────────────
  if (cafef.length > 0) {
    let msg = `🟠 *TIN TỪ CAFEF (${cafef.length} bài)*\n━━━━━━━━━━━━\n\n`;

    for (let i = 0; i < cafef.length; i++) {
      const a = cafef[i];
      msg += `*${i + 1}. ${escapeMarkdown(a.title)}*\n`;
      if (a.summary) {
        msg += `┗ ${escapeMarkdown(a.summary)}\n`;
      }
      msg += `🔗 [Đọc thêm](${a.url})\n\n`;

      // Chia nhỏ nếu tin nhắn quá dài (Telegram limit 4096 chars)
      if (msg.length > 3200) {
        messages.push(msg);
        msg = '';
      }
    }

    if (msg.trim()) messages.push(msg);
  }

  // ── VnExpress Section ─────────────────────────────────────────────────────
  if (vnexpress.length > 0) {
    let msg = `🔵 *TIN TỪ VNEXPRESS (${vnexpress.length} bài)*\n━━━━━━━━━━━━\n\n`;

    for (let i = 0; i < vnexpress.length; i++) {
      const a = vnexpress[i];
      msg += `*${i + 1}. ${escapeMarkdown(a.title)}*\n`;
      if (a.summary) {
        msg += `┗ ${escapeMarkdown(a.summary)}\n`;
      }
      msg += `🔗 [Đọc thêm](${a.url})\n\n`;

      if (msg.length > 3200) {
        messages.push(msg);
        msg = '';
      }
    }

    if (msg.trim()) messages.push(msg);
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  messages.push(
    `⏰ *Bản tin tiếp theo:* Sáng mai lúc 9:00\n` +
    `📊 Dùng /scan để xem tín hiệu kỹ thuật`
  );

  return messages;
}

/**
 * Format tin nhắn lỗi khi không lấy được tin
 */
export function formatNewsError(err) {
  return `⚠️ *Bản tin sáng:* Không lấy được tin tức hôm nay.\n_Lỗi: ${err.message}_\n\nSẽ thử lại vào ngày mai.`;
}

/** Escape ký tự đặc biệt trong Markdown Telegram */
function escapeMarkdown(text = '') {
  // Chỉ escape những ký tự gây lỗi parse trong Telegram MarkdownV1
  return text
    .replace(/\[/g, '(')
    .replace(/\]/g, ')')
    .replace(/`/g, "'");
}
