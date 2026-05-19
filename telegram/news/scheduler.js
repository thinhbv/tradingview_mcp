/**
 * News Scheduler — Lấy tin tức → Claude API phân tích → Gửi Telegram
 * Dùng fetch + cheerio lấy text, gửi Claude text API (không cần ảnh/CDP)
 */

import cron    from 'node-cron';
import * as cheerio from 'cheerio';
import Anthropic    from '@anthropic-ai/sdk';
import { config }   from '../config.js';
import { fetchAllIndices, formatIndicesMessage } from './market_indices.js';

let scheduledTask = null;

const HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'vi-VN,vi;q=0.9',
  'Accept':          'text/html,application/xhtml+xml,*/*;q=0.8',
};

// ─── Nguồn tin ────────────────────────────────────────────────────────────────

const NEWS_SOURCES = [
  {
    name:  'CafeF Chứng Khoán',
    emoji: '🟠',
    url:   'https://cafef.vn/thi-truong-chung-khoan.chn',
    parse: parseCafeF,
  },
  {
    name:  'VnExpress Chứng Khoán',
    emoji: '🔵',
    url:   'https://vnexpress.net/kinh-doanh/chung-khoan',
    parse: parseVnExpress,
  },
];

// ─── Parsers ──────────────────────────────────────────────────────────────────

async function fetchHtml(url) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: ctrl.signal });
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseCafeF(html) {
  const $ = cheerio.load(html);
  const items = [];

  $('a[href*=".chn"]').each((_, el) => {
    if (items.length >= 12) return false;
    const title = ($(el).attr('title') || $(el).text()).trim();
    const href  = $(el).attr('href') || '';
    if (title.length < 20 || !/\d{10,}/.test(href)) return;
    if (items.some(i => i.title === title)) return;
    items.push({ title });
  });

  return items.map(i => `• ${i.title}`).join('\n');
}

function parseVnExpress(html) {
  const $ = cheerio.load(html);
  const items = [];

  $('h3.title-news a, h2.title-news a, .item-news h3 a').each((_, el) => {
    if (items.length >= 8) return false;
    const title = $(el).text().trim();
    if (title.length < 15) return;
    if (items.some(i => i === title)) return;
    items.push(title);
  });

  return items.map(t => `• ${t}`).join('\n');
}

// ─── Claude API phân tích ─────────────────────────────────────────────────────

async function summarizeWithClaude(headlines, sourceName) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1200,
    system: `Bạn là trợ lý tóm tắt tin tức chứng khoán Việt Nam.
Đọc danh sách tiêu đề và chọn 5-7 tin quan trọng nhất.
Với mỗi tin, viết lại tiêu đề ngắn gọn và thêm 1 câu giải thích ý nghĩa với nhà đầu tư.
Format bắt buộc:
• [Tiêu đề ngắn gọn]: [1 câu ý nghĩa]
Viết bằng tiếng Việt, dễ hiểu.`,
    messages: [{
      role:    'user',
      content: `Đây là tiêu đề tin tức từ ${sourceName}:\n\n${headlines}\n\nHãy tóm tắt 5-7 tin quan trọng nhất.`,
    }],
  });

  return response.content[0]?.text?.trim() || '';
}

// ─── Gửi bản tin sáng ────────────────────────────────────────────────────────

export async function sendMorningDigest(sendToAll) {
  if (!process.env.ANTHROPIC_API_KEY) {
    sendToAll('⚠️ *Bản tin sáng:* Cần thêm `ANTHROPIC_API_KEY` vào `.env`');
    return;
  }

  const now = new Date().toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  });

  console.log('[News] 📰 Bắt đầu bản tin sáng...');
  sendToAll(`📰 *BẢN TIN CHỨNG KHOÁN SÁNG NAY*\n📅 ${now}\n_Đang tổng hợp... ⏳_`);


  for (const source of NEWS_SOURCES) {
    try {
      console.log(`[News] 🔍 Đang lấy: ${source.name}`);

      // 1. Fetch HTML
      const html      = await fetchHtml(source.url);
      // 2. Parse tiêu đề
      const headlines = source.parse(html);

      if (!headlines) {
        sendToAll(`⚠️ *${source.name}:* Không tìm thấy tin mới.`);
        continue;
      }

      // 3. Claude phân tích
      const summary = await summarizeWithClaude(headlines, source.name);

      // 4. Gửi kết quả
      const time = new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      sendToAll(
        `${source.emoji} *${source.name.toUpperCase()}*\n` +
        `━━━━━━━━━━━━━━━━━━━\n\n` +
        summary + `\n\n_⏰ ${time}_`
      );

      console.log(`[News] ✅ Xong: ${source.name}`);

    } catch (err) {
      console.error(`[News] ❌ ${source.name}:`, err.message);
      sendToAll(`⚠️ *${source.name}:* Lỗi — ${err.message}`);
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  // VNIndex tự động
  if (config.morning.vnindex) {
    try {
      console.log('[News] 📊 Đang lấy chỉ số VNIndex...');
      const indices = await fetchAllIndices();
      sendToAll(formatIndicesMessage(indices));
    } catch (err) {
      console.error('[News] ❌ VNIndex:', err.message);
      sendToAll(`⚠️ *VNIndex:* Lỗi — ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  // Deep news tự động theo watchlist
  if (config.morning.deepNews && process.env.ANTHROPIC_API_KEY) {
    const watchlist = config.scanner.watchlist;
    if (watchlist.length > 0) {
      console.log('[News] 🔬 Đang lấy tin chuyên sâu...');
      sendToAll(`🔬 *Tin chuyên sâu ${watchlist.length} mã...*`);
      for (const sym of watchlist) {
        await sendDeepNews(sym, sendToAll);
        await new Promise(r => setTimeout(r, 1500));
      }
    }
  }

  sendToAll(`✅ *Xong bản tin sáng!*\n📊 /scan — Tín hiệu kỹ thuật\n📰 /news — Xem lại bất cứ lúc nào`);
  console.log('[News] 🏁 Hoàn tất bản tin sáng');
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

export function startNewsScheduler(sendToAll, cronTime = '0 9 * * 1-5') {
  if (scheduledTask) scheduledTask.stop();

  if (!cron.validate(cronTime)) {
    console.error(`[News] ❌ Cron không hợp lệ: ${cronTime}`);
    return;
  }

  scheduledTask = cron.schedule(
    cronTime,
    () => sendMorningDigest(sendToAll),
    { timezone: 'Asia/Ho_Chi_Minh' }
  );

  const [min, hour] = cronTime.split(' ');
  const days = cronTime.includes('1-5') ? 'T2–T6' : 'hàng ngày';
  console.log(`[News] 📅 Lịch bản tin: ${hour}:${min.padStart(2,'0')} ${days} (GMT+7)`);
  return scheduledTask;
}

export function stopNewsScheduler() {
  if (scheduledTask) { scheduledTask.stop(); scheduledTask = null; }
}

// ─── Deep News theo mã cổ phiếu ───────────────────────────────────────────────

function parseCaFeFSearch(html) {
  const $ = cheerio.load(html);
  const items = [];

  // CafeF search results
  $('a[href*=".chn"]').each((_, el) => {
    if (items.length >= 12) return false;
    const title = ($(el).attr('title') || $(el).text()).trim();
    const href  = $(el).attr('href') || '';
    if (title.length < 15 || !/\d{8,}/.test(href)) return;
    if (items.some(i => i === title)) return;
    items.push(title);
  });

  return items.map(t => `• ${t}`).join('\n');
}

/**
 * Tìm và tóm tắt tin chuyên sâu cho 1 mã cổ phiếu
 * @param {string} symbol - Mã CK, VD: "SHB", "HOSE:VNM"
 * @param {Function} sendFn - Hàm gửi tin nhắn (chatId => message)
 */
export async function sendDeepNews(symbol, sendFn) {
  if (!process.env.ANTHROPIC_API_KEY) {
    sendFn('⚠️ *Deep News* cần `ANTHROPIC_API_KEY` trong `.env`');
    return;
  }

  // Lấy ticker thuần (bỏ prefix exchange)
  const ticker = symbol.includes(':') ? symbol.split(':')[1] : symbol;

  sendFn(`🔬 *Đang tìm tin về ${ticker}...* ⏳`);

  try {
    // Tìm kiếm trên CafeF
    const searchUrl = `https://cafef.vn/search/q-${ticker.toLowerCase()}.chn`;
    const html = await fetchHtml(searchUrl);
    const headlines = parseCaFeFSearch(html);

    if (!headlines) {
      sendFn(`⚠️ *${ticker}:* Không tìm thấy tin tức trên CafeF.`);
      return;
    }

    const client   = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: `Bạn là chuyên gia phân tích cổ phiếu Việt Nam.
Đọc các tiêu đề tin tức về mã ${ticker} và tóm tắt chuyên sâu.
Tập trung vào: kết quả kinh doanh, cổ tức, M&A, tin tức quan trọng ảnh hưởng giá.
Format bắt buộc:
📌 [Tiêu đề ngắn gọn]: [1-2 câu phân tích ý nghĩa với nhà đầu tư]
Viết tiếng Việt, chuyên nghiệp, tối đa 6 điểm.`,
      messages: [{
        role:    'user',
        content: `Tiêu đề tin tức về ${ticker}:\n\n${headlines}\n\nPhân tích chuyên sâu cho nhà đầu tư.`,
      }],
    });

    const summary = response.content[0]?.text?.trim() || '';
    const time    = new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

    sendFn(
      `🔬 *TIN CHUYÊN SÂU: ${ticker}*\n` +
      `━━━━━━━━━━━━━━━━━━━\n\n` +
      summary +
      `\n\n_⏰ ${time} — Nguồn: CafeF_`
    );
  } catch (err) {
    console.error(`[DeepNews] ❌ ${ticker}:`, err.message);
    sendFn(`❌ *Lỗi tìm tin ${ticker}:* ${err.message}`);
  }
}
