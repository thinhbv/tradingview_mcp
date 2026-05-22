/**
 * Scanner — Tự động quét watchlist và phát hiện tín hiệu
 * Dùng lại core tradingview-mcp để đọc dữ liệu từ CDP
 */

import { chart, data } from '../src/core/index.js';
import { detectSignal } from './signals.js';
import { config } from './config.js';

const { delayBetweenSymbols, watchlist: defaultWatchlist } = config.scanner;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Kiểm tra có trong giờ giao dịch HOSE không
 */
export function isMarketOpen() {
  const now  = new Date();
  const day  = now.getDay(); // 0=CN, 6=T7
  if (day === 0 || day === 6) return false;

  const totalMinutes  = now.getHours() * 60 + now.getMinutes();
  const openMinutes   = config.scanner.marketOpenHour  * 60 + (config.scanner.marketOpenMinute  ?? 0);
  const closeMinutes  = config.scanner.marketCloseHour * 60 + (config.scanner.marketCloseMinute ?? 0);

  return totalMinutes >= openMinutes && totalMinutes <= closeMinutes;
}

/**
 * Quét một mã — switch chart, chờ load, lấy dữ liệu, phân tích
 */
async function scanSymbol(symbol) {
  try {
    await chart.setSymbol({ symbol });
    await sleep(delayBetweenSymbols); // Chờ chart load xong

    const ohlcv = await data.getOhlcv({ count: 60, summary: true });

    if (!ohlcv || !ohlcv.last_5_bars || ohlcv.last_5_bars.length === 0) {
      return { symbol, signal: 'NEUTRAL', error: 'Không có dữ liệu' };
    }

    const signalResult = detectSignal(ohlcv);
    return { symbol, ...signalResult };

  } catch (err) {
    return { symbol, signal: 'NEUTRAL', error: err.message };
  }
}

/**
 * Quét toàn bộ watchlist lần lượt (không thể song song do 1 chart)
 * @param {string[]} symbols - Danh sách mã cần quét
 * @param {function} [onProgress] - Callback sau mỗi mã: onProgress(result, index, total)
 */
export async function scanAll(symbols = defaultWatchlist, onProgress = null) {
  const results = [];

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    console.log(`[Scanner] Quét ${symbol} (${i + 1}/${symbols.length})...`);

    const result = await scanSymbol(symbol);
    results.push(result);

    if (onProgress) onProgress(result, i, symbols.length);

    // Nhỏ chờ giữa các mã để tránh rate limit CDP
    if (i < symbols.length - 1) await sleep(500);
  }

  return results;
}

// ─── Scan state (có thể thay đổi qua lệnh bot) ───────────────────────────────
let scanEnabled   = true;
let scanIntervalMs = config.scanner.intervalMs;

export function setScanEnabled(val)  { scanEnabled    = !!val; }
export function setScanInterval(ms)  { scanIntervalMs = ms; }
export function getScanState()       { return { enabled: scanEnabled, intervalMs: scanIntervalMs }; }

/**
 * Bắt đầu auto-scanner theo lịch động
 * @param {function} onSignal    - Callback khi có tín hiệu: onSignal(result)
 * @param {function} getWatchlist - Hàm lấy watchlist động
 */
export function startAutoScanner(onSignal, getWatchlist = null) {
  const minScore = config.signals.minScore;

  async function runScan() {
    if (!scanEnabled) {
      console.log(`[Scanner] ⏸️  Auto-scan đang TẮT — bỏ qua lần này`);
    } else if (!isMarketOpen()) {
      console.log(`[Scanner] ⏸️  Ngoài giờ giao dịch (${new Date().toLocaleTimeString('vi-VN')}) — bỏ qua`);
    } else {
      const symbols = getWatchlist ? getWatchlist() : defaultWatchlist;
      console.log(`\n[Scanner] 🔍 Bắt đầu scan ${symbols.length} mã lúc ${new Date().toLocaleTimeString('vi-VN')}`);

      const results = await scanAll(symbols);

      let alertCount = 0;
      for (const result of results) {
        if (result.error) {
          console.log(`[Scanner] ⚠️  ${result.symbol}: ${result.error}`);
          continue;
        }
        if (result.signal !== 'NEUTRAL' && result.score >= minScore) {
          console.log(`[Scanner] 📢 ${result.symbol}: ${result.signal} (score=${result.score})`);
          onSignal(result);
          alertCount++;
        } else {
          console.log(`[Scanner] ⬜ ${result.symbol}: ${result.signal} (score=${result.score ?? 0})`);
        }
      }

      console.log(`[Scanner] ✅ Xong. ${alertCount} tín hiệu được gửi. Scan tiếp sau ${scanIntervalMs / 60000} phút.\n`);
    }

    // Lên lịch lần tiếp với interval hiện tại (có thể đã thay đổi)
    setTimeout(runScan, scanIntervalMs);
  }

  // Lên lịch lần đầu sau 1 interval
  setTimeout(runScan, scanIntervalMs);
}
