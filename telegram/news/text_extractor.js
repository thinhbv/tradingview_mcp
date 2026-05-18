/**
 * Text Extractor — Lấy nội dung text từ trang web
 * - Server-rendered (CafeF): dùng fetch + cheerio
 * - JS-rendered (TradingView): dùng CDP navigate + Runtime.evaluate
 */

import * as cheerio from 'cheerio';
import CDP from 'chrome-remote-interface';

const CDP_PORT = 9222;
const HEADERS  = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
  'Accept-Language': 'vi-VN,vi;q=0.9',
  'Accept':          'text/html,application/xhtml+xml,*/*;q=0.8',
};

// ─── Fetch + Cheerio (server-rendered) ───────────────────────────────────────

/**
 * Lấy text từ trang server-rendered (CafeF, VnExpress...)
 * @returns {Promise<string>} - Nội dung text đã làm sạch
 */
export async function fetchPageText(url, maxChars = 10000) {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), 10000);

  try {
    const res  = await fetch(url, { headers: HEADERS, signal: controller.signal });
    const html = await res.text();
    const $    = cheerio.load(html);

    // Xóa các phần không cần thiết
    $('script, style, nav, header, footer, .ads, .advertisement, .sidebar, iframe').remove();

    // Lấy các block chứa tin tức
    const blocks = [];

    // Tiêu đề bài viết
    $('h1, h2, h3, a[href*=".chn"], a.title-news').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 20 && text.length < 200) blocks.push(`📌 ${text}`);
    });

    // Mô tả/sapo
    $('.sapo, .lead, .description, p.description').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 30) blocks.push(text);
    });

    const result = [...new Set(blocks)].join('\n').substring(0, maxChars);
    console.log(`[TextExtractor] Lấy được ${result.length} ký tự từ ${url}`);
    return result;

  } finally {
    clearTimeout(timer);
  }
}

// ─── CDP Navigate + Extract (JS-rendered) ────────────────────────────────────

/**
 * Lấy text từ trang JS-rendered bằng cách dùng Chrome CDP
 * Mở tab mới, navigate, đợi render, extract text, đóng tab
 * @returns {Promise<string>}
 */
export async function extractPageTextViaCDP(url, waitMs = 5000, maxChars = 10000) {
  let client = null;

  try {
    // Tạo tab mới
    const newTarget = await CDP.New({ host: 'localhost', port: CDP_PORT });
    client = await CDP({ host: 'localhost', port: CDP_PORT, target: newTarget.id });

    const { Page, Runtime, Emulation } = client;

    await Emulation.setUserAgentOverride({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
    });
    await Page.enable();

    // Navigate
    await Promise.race([
      new Promise(resolve => { Page.loadEventFired(resolve); Page.navigate({ url }); }),
      new Promise(resolve => setTimeout(resolve, 12000)),
    ]);

    // Đợi JS render
    await new Promise(r => setTimeout(r, waitMs));

    // Extract text từ DOM
    const { result } = await Runtime.evaluate({
      expression: `
        (function() {
          // Xóa noise
          ['script','style','nav','header','footer'].forEach(tag => {
            document.querySelectorAll(tag).forEach(el => el.remove());
          });

          // Lấy tiêu đề tin
          const headlines = [];
          document.querySelectorAll('h1,h2,h3,a[class*="title"],a[class*="headline"]').forEach(el => {
            const t = el.innerText?.trim();
            if (t && t.length > 15 && t.length < 200) headlines.push('📌 ' + t);
          });

          // Lấy paragraph
          const paras = [];
          document.querySelectorAll('p,td').forEach(el => {
            const t = el.innerText?.trim();
            if (t && t.length > 30 && t.length < 500) paras.push(t);
          });

          const all = [...new Set([...headlines, ...paras])];
          return all.join('\\n').substring(0, ${maxChars});
        })()
      `,
      returnByValue: true,
    });

    const text = result.value || '';
    console.log(`[TextExtractor] CDP: ${text.length} ký tự từ ${url}`);
    return text;

  } finally {
    if (client) {
      const id = client.target?.id;
      await client.close().catch(() => {});
      if (id) await CDP.Close({ host: 'localhost', port: CDP_PORT, id }).catch(() => {});
    }
  }
}
