/**
 * News Scheduler — Lấy tin tức → Claude API phân tích → Gửi Telegram
 * Dùng fetch + cheerio lấy text, gửi Claude text API (không cần ảnh/CDP)
 */

import cron    from 'node-cron';
import * as cheerio from 'cheerio';
import Anthropic    from '@anthropic-ai/sdk';
import { config }   from '../config.js';
import { fetchAllIndices, formatIndicesMessage } from './market_indices.js';
import { screenshotUrl } from './screenshot.js';

let scheduledTask = null;

const HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'vi-VN,vi;q=0.9',
  'Accept':          'text/html,application/xhtml+xml,*/*;q=0.8',
};

// ─── Khung thời gian lọc tin: 9h hôm qua → 9h hôm nay ───────────────────────

function getTimeWindow() {
  const now   = new Date();
  const to    = new Date(now);
  to.setHours(9, 0, 0, 0);
  // Nếu hiện tại chưa đến 9h sáng thì "9h hôm nay" là tương lai → lùi về hôm qua
  if (now < to) to.setDate(to.getDate() - 1);

  const from = new Date(to);
  from.setDate(from.getDate() - 1);

  return { from, to };
}

/** Kiểm tra bài viết có trong khung giờ không (trả về true nếu không parse được thời gian) */
function isInWindow(dateStr) {
  if (!dateStr) return true;
  const parsed = new Date(dateStr);
  if (isNaN(parsed)) return true;
  const { from, to } = getTimeWindow();
  return parsed >= from && parsed <= to;
}

// ─── Nguồn tin thống nhất (dùng cho cả basic news lẫn deep news) ──────────────

const NEWS_SOURCES = [
  {
    name:      'CafeF',
    emoji:     '🟠',
    url:       'https://cafef.vn/thi-truong-chung-khoan.chn',
    searchUrl: (ticker) => `https://cafef.vn/search/q-${ticker.toLowerCase()}.chn`,
    parse:     parseCafeF,
  },
  {
    name:      'VnExpress',
    emoji:     '🔵',
    url:       'https://vnexpress.net/kinh-doanh/chung-khoan',
    searchUrl: (ticker) => `https://vnexpress.net/search?q=${encodeURIComponent(ticker)}`,
    parse:     parseVnExpress,
  },
  {
    name:      'Vietstock',
    emoji:     '🟢',
    url:       'https://vietstock.vn/chung-khoan.htm',
    searchUrl: (ticker) => `https://vietstock.vn/${ticker.toLowerCase()}/tin-tuc.htm`,
    parse:     parseVietstock,
  },
  {
    name:      'TTNCK',
    emoji:     '🟡',
    url:       'https://www.tinnhanhchungkhoan.vn/',
    searchUrl: (ticker) => `https://www.tinnhanhchungkhoan.vn/tim-kiem/?q=${encodeURIComponent(ticker)}`,
    parse:     parseTinNhanh,
  },
  {
    name:      'VietnamBiz',
    emoji:     '🔴',
    url:       'https://vietnambiz.vn/chung-khoan.htm',
    searchUrl: (ticker) => `https://vietnambiz.vn/tim-kiem.htm?keyword=${encodeURIComponent(ticker)}`,
    parse:     parseVietnamBiz,
  },
  {
    name:      'VnEconomy',
    emoji:     '🟣',
    url:       'https://vneconomy.vn/chung-khoan.htm',
    searchUrl: (ticker) => `https://vneconomy.vn/search.htm?query=${encodeURIComponent(ticker)}`,
    parse:     parseVnEconomy,
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

function parseCafeF(html, limit = 12) {
  const $ = cheerio.load(html);
  const items = [];

  $('a[href*=".chn"]').each((_, el) => {
    if (items.length >= limit) return false;
    const title   = ($(el).attr('title') || $(el).text()).trim();
    const href    = $(el).attr('href') || '';
    const timeStr = $(el).closest('li, .item, article').find('time, .time, .date').first().attr('datetime')
                 || $(el).closest('li, .item, article').find('time, .time, .date').first().text().trim();
    if (title.length < 20 || !/\d{8,}/.test(href)) return;
    if (!isInWindow(timeStr || null)) return;
    if (items.some(i => i.title === title)) return;
    const url = href.startsWith('http') ? href : `https://cafef.vn${href}`;
    items.push({ title, url });
  });

  return items;
}

function parseVnExpress(html, limit = 10) {
  const $ = cheerio.load(html);
  const items = [];

  $('h3.title-news a, h2.title-news a, .item-news h3 a, .title-news a').each((_, el) => {
    if (items.length >= limit) return false;
    const title    = $(el).text().trim();
    const href     = $(el).attr('href') || '';
    const timeStr  = $(el).closest('article, .item-news, li').find('span.time-ago, span.date').first().text().trim();
    if (title.length < 15) return;
    if (!href.startsWith('http')) return;
    if (!isInWindow(timeStr || null)) return;
    if (items.some(i => i.title === title)) return;
    items.push({ title, url: href });
  });

  return items;
}

function parseVietstock(html, limit = 10) {
  const $ = cheerio.load(html);
  const items = [];

  $('.news-item a[href], .list-news a[href], article a[href]').each((_, el) => {
    if (items.length >= limit) return false;
    const title   = ($(el).attr('title') || $(el).text()).trim();
    const href    = $(el).attr('href') || '';
    const timeStr = $(el).closest('li, .news-item, article').find('time, .time, .date').first().attr('datetime')
                 || $(el).closest('li, .news-item, article').find('time, .time, .date').first().text().trim();
    if (title.length < 15) return;
    if (!isInWindow(timeStr || null)) return;
    if (items.some(i => i.title === title)) return;
    const url = href.startsWith('http') ? href : `https://vietstock.vn${href}`;
    items.push({ title, url });
  });

  return items;
}

function parseTinNhanh(html, limit = 10) {
  const $ = cheerio.load(html);
  const items = [];

  $('h2 a[href], h3 a[href], .title a[href], .post-title a[href]').each((_, el) => {
    if (items.length >= limit) return false;
    const title   = $(el).text().trim();
    const href    = $(el).attr('href') || '';
    const timeStr = $(el).closest('article, .post, li').find('time, .date, .time').first().attr('datetime')
                 || $(el).closest('article, .post, li').find('time, .date, .time').first().text().trim();
    if (title.length < 15) return;
    if (!isInWindow(timeStr || null)) return;
    if (items.some(i => i.title === title)) return;
    const url = href.startsWith('http') ? href : `https://www.tinnhanhchungkhoan.vn${href}`;
    items.push({ title, url });
  });

  return items;
}

function parseVietnamBiz(html, limit = 10) {
  const $ = cheerio.load(html);
  const items = [];

  $('h2 a[href], h3 a[href], .story__heading a, .cms-link[href]').each((_, el) => {
    if (items.length >= limit) return false;
    const title   = ($(el).attr('title') || $(el).text()).trim();
    const href    = $(el).attr('href') || '';
    const timeStr = $(el).closest('article, .story, li').find('time, .time, .date').first().attr('datetime')
                 || $(el).closest('article, .story, li').find('time, .time, .date').first().text().trim();
    if (title.length < 15) return;
    if (!isInWindow(timeStr || null)) return;
    if (items.some(i => i.title === title)) return;
    const url = href.startsWith('http') ? href : `https://vietnambiz.vn${href}`;
    items.push({ title, url });
  });

  return items;
}

function parseVnEconomy(html, limit = 10) {
  const $ = cheerio.load(html);
  const items = [];

  $('h2 a[href], h3 a[href], .story-title a, .article-title a').each((_, el) => {
    if (items.length >= limit) return false;
    const title   = ($(el).attr('title') || $(el).text()).trim();
    const href    = $(el).attr('href') || '';
    const timeStr = $(el).closest('article, .story, li').find('time, .time, .date, .post-time').first().attr('datetime')
                 || $(el).closest('article, .story, li').find('time, .time, .date, .post-time').first().text().trim();
    if (title.length < 15) return;
    if (!isInWindow(timeStr || null)) return;
    if (items.some(i => i.title === title)) return;
    const url = href.startsWith('http') ? href : `https://vneconomy.vn${href}`;
    items.push({ title, url });
  });

  return items;
}

// ─── Fallback: screenshot + Vision API khi parser không lấy được tin ─────────

/**
 * Gọi Vision API phân tích ảnh chụp trang web, parse output thành [{title, url}]
 * Output Claude: mỗi dòng "• Tiêu đề bài viết" (không có URL — dùng url trang)
 */
async function parseByVision(imageBase64, sourceUrl, sourceName) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    system: `Bạn đọc ảnh chụp màn hình trang tin tức chứng khoán Việt Nam.
Liệt kê tối đa 10 tiêu đề bài viết nhìn thấy trên trang.
Chỉ lấy tin liên quan chứng khoán, cổ phiếu, thị trường.
Mỗi tiêu đề 1 dòng, bắt đầu bằng "• ".
Không thêm giải thích, không đánh số.`,
    messages: [{
      role:    'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
        { type: 'text',  text: `Trang: ${sourceName}. Liệt kê các tiêu đề tin tức nhìn thấy.` },
      ],
    }],
  });

  const text  = response.content[0]?.text?.trim() || '';
  const items = [];
  for (const line of text.split('\n')) {
    const title = line.replace(/^•\s*/, '').trim();
    if (title.length >= 15) items.push({ title, url: sourceUrl });
  }
  return items;
}

/**
 * Lấy tin từ 1 nguồn — nếu parser trả về 0 tin thì fallback chụp ảnh + Vision API
 */
async function fetchSourceWithFallback(source, urlToFetch, limit) {
  // Thử parse HTML trước
  try {
    const html   = await fetchHtml(urlToFetch);
    const parsed = source.parse(html, limit);
    if (parsed.length > 0) return parsed;
    console.log(`[News] ⚠️  ${source.name}: parser trả về 0 tin — thử screenshot fallback`);
  } catch (err) {
    console.log(`[News] ⚠️  ${source.name}: fetch/parse lỗi (${err.message}) — thử screenshot fallback`);
  }

  // Fallback: chụp ảnh + Vision API
  if (!process.env.ANTHROPIC_API_KEY) return [];
  try {
    const imageBase64 = await screenshotUrl(urlToFetch, { waitMs: 3000 });
    const items       = await parseByVision(imageBase64, urlToFetch, source.name);
    console.log(`[News] 📸 ${source.name}: screenshot fallback lấy được ${items.length} tin`);
    return items;
  } catch (err) {
    console.error(`[News] ❌ ${source.name}: screenshot fallback thất bại (${err.message})`);
    return [];
  }
}

// ─── Dedup theo nội dung (Jaccard similarity trên từ) ────────────────────────

function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-záàảãạăắằẳẵặâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2); // bỏ từ ngắn (<= 2 ký tự)
}

function jaccardSimilarity(a, b) {
  const setA = new Set(normalizeTitle(a));
  const setB = new Set(normalizeTitle(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  const intersection = [...setA].filter(w => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}

/**
 * Lọc các tiêu đề trùng nhau về nội dung (threshold: 0.45)
 * @param {{ title: string, source: string }[]} items
 * @returns {{ title: string, source: string }[]}
 */
function deduplicateByContent(items, threshold = 0.45) {
  const result = [];
  for (const item of items) {
    const isDuplicate = result.some(r => jaccardSimilarity(r.title, item.title) >= threshold);
    if (!isDuplicate) result.push(item);
  }
  return result;
}

// ─── Claude API phân tích ─────────────────────────────────────────────────────

/**
 * Claude chọn tin quan trọng và viết tóm tắt, trả về số thứ tự để map URL
 * Output mỗi dòng: [N] Tiêu đề ngắn: 1 câu ý nghĩa
 */
async function summarizeWithClaude(items, context = 'thị trường chứng khoán') {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const headlineText = items
    .map((h, i) => `[${i + 1}] [${h.source}] ${h.title}`)
    .join('\n');

  const response = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    system: `Bạn là trợ lý tóm tắt tin tức chứng khoán Việt Nam.
Đọc danh sách tiêu đề đánh số và chọn 6-8 tin quan trọng nhất về ${context}.
Với mỗi tin được chọn, giữ nguyên số thứ tự gốc và viết 1 câu giải thích ý nghĩa.
Format bắt buộc (giữ đúng, mỗi tin 1 dòng):
[N] Tiêu đề ngắn gọn: 1 câu ý nghĩa với nhà đầu tư
Viết bằng tiếng Việt, dễ hiểu. Không lặp lại tin trùng nội dung.`,
    messages: [{
      role:    'user',
      content: `Tiêu đề tin tức (đã lọc trùng):\n\n${headlineText}\n\nChọn và tóm tắt 6-8 tin quan trọng nhất.`,
    }],
  });

  return response.content[0]?.text?.trim() || '';
}

/**
 * Parse output Claude + map lại URL gốc → format message Telegram có link
 */
function formatWithLinks(claudeOutput, items) {
  const lines = claudeOutput.split('\n').filter(l => l.trim());
  const result = [];

  for (const line of lines) {
    const match = line.match(/^\[(\d+)\]\s*(.+)/);
    if (!match) continue;

    const idx  = parseInt(match[1], 10) - 1;
    const text = match[2].trim();
    const item = items[idx];

    if (!item) continue;

    // Tách "Tiêu đề: Giải thích" nếu có dấu ":"
    const colonIdx = text.indexOf(':');
    if (colonIdx > 0 && colonIdx < text.length - 1) {
      const title   = text.substring(0, colonIdx).trim();
      const explain = text.substring(colonIdx + 1).trim();
      result.push(`• *${escapeMarkdown(title)}*: ${escapeMarkdown(explain)}\n  🔗 [${item.source}](${item.url})`);
    } else {
      result.push(`• ${escapeMarkdown(text)}\n  🔗 [${item.source}](${item.url})`);
    }
  }

  return result.join('\n\n');
}

function escapeMarkdown(text = '') {
  return text.replace(/\[/g, '(').replace(/\]/g, ')').replace(/`/g, "'");
}

// ─── Gửi bản tin sáng ────────────────────────────────────────────────────────

export async function sendMorningDigest(sendToAll, dynamicWatchlist = null) {
  if (!process.env.ANTHROPIC_API_KEY) {
    sendToAll('⚠️ *Bản tin sáng:* Cần thêm `ANTHROPIC_API_KEY` vào `.env`');
    return;
  }

  const now = new Date().toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  });

  console.log('[News] 📰 Bắt đầu bản tin sáng...');
  sendToAll(`📰 *BẢN TIN CHỨNG KHOÁN SÁNG NAY*\n📅 ${now}\n_Đang tổng hợp từ ${NEWS_SOURCES.length} nguồn... ⏳_`);

  // 1. Fetch tất cả nguồn song song
  const allRaw = [];
  const fetchResults = await Promise.allSettled(
    NEWS_SOURCES.map(async (source) => {
      console.log(`[News] 🔍 Đang lấy: ${source.name}`);
      const items = await fetchSourceWithFallback(source, source.url, 12);
      return items.map(item => ({ ...item, source: source.name }));
    })
  );

  for (const res of fetchResults) {
    if (res.status === 'fulfilled') allRaw.push(...res.value);
  }

  if (allRaw.length === 0) {
    sendToAll('⚠️ *Bản tin sáng:* Không lấy được tin từ bất kỳ nguồn nào.');
    return;
  }

  // 2. Lọc trùng nội dung
  const deduplicated = deduplicateByContent(allRaw);
  const removedCount = allRaw.length - deduplicated.length;
  console.log(`[News] Tổng ${allRaw.length} tiêu đề, lọc trùng còn ${deduplicated.length} (bỏ ${removedCount} trùng)`);

  // 3. Claude phân tích + format với link nguồn
  try {
    const claudeOutput = await summarizeWithClaude(deduplicated, 'thị trường chứng khoán Việt Nam');
    const formatted    = formatWithLinks(claudeOutput, deduplicated);
    const sourceList   = NEWS_SOURCES.map(s => `${s.emoji} ${s.name}`).join(' · ');
    const time         = new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

    sendToAll(
      `📊 *TIN TỨC THỊ TRƯỜNG*\n` +
      `━━━━━━━━━━━━━━━━━━━\n\n` +
      formatted +
      `\n\n_⏰ ${time} — Tổng hợp từ: ${sourceList}_\n` +
      `_${deduplicated.length} tin (đã lọc ${removedCount} trùng)_`
    );
    console.log('[News] ✅ Xong bản tin thị trường');
  } catch (err) {
    console.error('[News] ❌ Claude lỗi:', err.message);
    sendToAll(`⚠️ *Bản tin:* Lỗi phân tích AI — ${err.message}`);
  }

  await new Promise(r => setTimeout(r, 2000));

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
    const watchlist = dynamicWatchlist ?? config.scanner.watchlist;
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

export function startNewsScheduler(sendToAll, cronTime = '0 9 * * 1-5', getWatchlist = null) {
  if (scheduledTask) scheduledTask.stop();

  if (!cron.validate(cronTime)) {
    console.error(`[News] ❌ Cron không hợp lệ: ${cronTime}`);
    return;
  }

  scheduledTask = cron.schedule(
    cronTime,
    () => sendMorningDigest(sendToAll, getWatchlist ? getWatchlist() : null),
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

/**
 * Tìm và tóm tắt tin chuyên sâu cho 1 mã — tìm kiếm trên tất cả NEWS_SOURCES
 * @param {string} symbol - Mã CK, VD: "SHB", "HOSE:VNM"
 * @param {Function} sendFn - Hàm gửi tin nhắn
 */
export async function sendDeepNews(symbol, sendFn) {
  if (!process.env.ANTHROPIC_API_KEY) {
    sendFn('⚠️ *Deep News* cần `ANTHROPIC_API_KEY` trong `.env`');
    return;
  }

  const ticker = symbol.includes(':') ? symbol.split(':')[1] : symbol;
  sendFn(`🔬 *Đang tìm tin về ${ticker}...* ⏳`);

  try {
    // Fetch song song từ tất cả nguồn
    const fetchResults = await Promise.allSettled(
      NEWS_SOURCES.map(async (source) => {
        const items = await fetchSourceWithFallback(source, source.searchUrl(ticker), 10);
        return items.map(item => ({ ...item, source: source.name }));
      })
    );

    const allRaw = [];
    for (const res of fetchResults) {
      if (res.status === 'fulfilled') allRaw.push(...res.value);
    }

    if (allRaw.length === 0) {
      sendFn(`⚠️ *${ticker}:* Không tìm thấy tin tức trên các nguồn.`);
      return;
    }

    // Lọc trùng nội dung
    const deduplicated = deduplicateByContent(allRaw);
    const removedCount = allRaw.length - deduplicated.length;
    console.log(`[DeepNews] ${ticker}: ${allRaw.length} tiêu đề, còn ${deduplicated.length} sau khi lọc trùng`);

    const client      = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const headlineText = deduplicated
      .map((h, i) => `[${i + 1}] [${h.source}] ${h.title}`)
      .join('\n');

    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: `Bạn là chuyên gia phân tích cổ phiếu Việt Nam.
Đọc các tiêu đề tin tức về mã ${ticker} và chọn tối đa 6 tin quan trọng nhất.
Tập trung vào: kết quả kinh doanh, cổ tức, M&A, tin tức ảnh hưởng giá.
Format bắt buộc (giữ số thứ tự gốc, mỗi tin 1 dòng):
[N] Tiêu đề ngắn gọn: 1-2 câu phân tích ý nghĩa với nhà đầu tư
Viết tiếng Việt, chuyên nghiệp. Không lặp tin trùng nội dung.`,
      messages: [{
        role:    'user',
        content: `Tiêu đề tin tức về ${ticker} (đã lọc trùng):\n\n${headlineText}\n\nPhân tích chuyên sâu cho nhà đầu tư.`,
      }],
    });

    const claudeOutput = response.content[0]?.text?.trim() || '';
    const formatted    = formatWithLinks(claudeOutput, deduplicated);
    const time         = new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const sourceList   = NEWS_SOURCES.map(s => s.name).join(' + ');

    sendFn(
      `🔬 *TIN CHUYÊN SÂU: ${ticker}*\n` +
      `━━━━━━━━━━━━━━━━━━━\n\n` +
      formatted +
      `\n\n_⏰ ${time} — Nguồn: ${sourceList}_\n` +
      `_${deduplicated.length} tin (đã lọc ${removedCount} trùng)_`
    );
  } catch (err) {
    console.error(`[DeepNews] ❌ ${ticker}:`, err.message);
    sendFn(`❌ *Lỗi tìm tin ${ticker}:* ${err.message}`);
  }
}
