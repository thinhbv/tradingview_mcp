/**
 * News Scraper — Lấy tin tức chứng khoán từ CafeF và VnExpress
 * Sử dụng fetch (Node 18+) + cheerio để parse HTML
 */

import * as cheerio from 'cheerio';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'vi-VN,vi;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

const TIMEOUT_MS = 10000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Fetch HTML với timeout */
async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ─── CAFEF Scraper ────────────────────────────────────────────────────────────

/**
 * Lấy danh sách bài viết từ CafeF Chứng khoán
 * @returns {Promise<{title, url, time}[]>}
 */
export async function fetchCafeF(limit = 8) {
  try {
    const html = await fetchHtml('https://cafef.vn/thi-truong-chung-khoan.chn');
    const $    = cheerio.load(html);
    const articles = [];

    // Lấy tất cả link bài viết .chn
    $('a[href*=".chn"]').each((i, el) => {
      if (articles.length >= limit) return false;

      const $el   = $(el);
      const title = ($el.attr('title') || $el.text()).trim();
      const href  = $el.attr('href') || '';

      // Lọc: chỉ lấy link bài viết thực sự (có số ID dài ở cuối)
      if (!title || title.length < 20) return;
      if (!/\d{10,}/.test(href)) return;
      if (articles.some(a => a.url === href)) return; // dedup

      const url = href.startsWith('http') ? href : `https://cafef.vn${href}`;
      articles.push({ title, url, source: 'CafeF' });
    });

    return articles;
  } catch (err) {
    console.error('[Scraper] CafeF lỗi:', err.message);
    return [];
  }
}

// ─── VnExpress Scraper ────────────────────────────────────────────────────────

/**
 * Lấy danh sách bài viết từ VnExpress Chứng khoán
 * @returns {Promise<{title, url, time}[]>}
 */
export async function fetchVnExpress(limit = 5) {
  try {
    const html = await fetchHtml('https://vnexpress.net/kinh-doanh/chung-khoan');
    const $    = cheerio.load(html);
    const articles = [];

    $('.title-news a, h3.title-news a, h2.title-news a').each((i, el) => {
      if (articles.length >= limit) return false;

      const $el   = $(el);
      const title = $el.text().trim();
      const href  = $el.attr('href') || '';

      if (!title || title.length < 15) return;
      if (!href.includes('vnexpress.net')) return;
      if (articles.some(a => a.url === href)) return;

      articles.push({ title, url: href, source: 'VnExpress' });
    });

    return articles;
  } catch (err) {
    console.error('[Scraper] VnExpress lỗi:', err.message);
    return [];
  }
}

// ─── Article Content Fetcher ──────────────────────────────────────────────────

/**
 * Lấy nội dung tóm tắt của 1 bài viết CafeF
 * @returns {Promise<string>} - 2-3 câu tóm tắt
 */
export async function fetchArticleSummary(url) {
  try {
    const html = await fetchHtml(url);
    const $    = cheerio.load(html);

    // CafeF: lead paragraph thường nằm trong .sapo hoặc p đầu tiên
    const sapo = $('.sapo, .lead, .article-sapo').first().text().trim();
    if (sapo && sapo.length > 50) return truncate(sapo, 250);

    // Lấy đoạn văn đầu tiên từ body bài viết
    const firstPara = $('.detail-content p, .article-body p, .content p').first().text().trim();
    if (firstPara && firstPara.length > 50) return truncate(firstPara, 250);

    return '';
  } catch {
    return '';
  }
}

/**
 * Lấy nội dung tóm tắt của 1 bài VnExpress
 */
export async function fetchVnExpressSummary(url) {
  try {
    const html = await fetchHtml(url);
    const $    = cheerio.load(html);

    const desc = $('p.description, .lead, .header-content p').first().text().trim();
    if (desc && desc.length > 50) return truncate(desc, 250);

    const firstPara = $('article p').first().text().trim();
    if (firstPara) return truncate(firstPara, 250);

    return '';
  } catch {
    return '';
  }
}

// ─── Main: Lấy tất cả tin tức ────────────────────────────────────────────────

/**
 * Lấy và làm phong phú tin tức từ tất cả nguồn
 * @returns {Promise<{title, url, source, summary}[]>}
 */
export async function fetchAllNews() {
  console.log('[News] Đang lấy tin từ CafeF và VnExpress...');

  const [cafef, vnexpress] = await Promise.all([
    fetchCafeF(8),
    fetchVnExpress(5),
  ]);

  const all = [...cafef, ...vnexpress];
  console.log(`[News] Tìm thấy ${all.length} bài (${cafef.length} CafeF, ${vnexpress.length} VnExpress)`);

  // Lấy summary cho từng bài (tuần tự để tránh spam server)
  for (const article of all) {
    await sleep(500);
    if (article.source === 'CafeF') {
      article.summary = await fetchArticleSummary(article.url);
    } else {
      article.summary = await fetchVnExpressSummary(article.url);
    }
  }

  return all;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncate(text, maxLen) {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen).replace(/\s\S*$/, '') + '...';
}
