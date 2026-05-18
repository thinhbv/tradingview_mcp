/**
 * Signal Detection Engine
 * Phân tích dữ liệu OHLCV và trả về tín hiệu MUA/BÁN/THEO DÕI
 *
 * Scoring system (không cần RSI/MACD — chỉ dùng giá + khối lượng):
 *
 * BUY:  +2 gần đáy 60 phiên | +1 nến xanh | +1 KL cao + xanh | +1 đóng cao trong ngày
 * SELL: +2 gần đỉnh 60 phiên | +1 nến đỏ | +1 KL cao + đỏ | +1 đóng thấp trong ngày
 *
 * Score >= 4: STRONG (gửi alert khẩn)
 * Score 2-3:  NORMAL (gửi alert thường)
 * Score 0-1:  Bỏ qua
 */

import { config } from './config.js';

const { oversoldPct, overboughtPct, volumeMultiplier } = config.signals;

/**
 * Phân tích OHLCV summary và trả về tín hiệu
 * @param {object} ohlcv - Kết quả từ data.getOhlcv({ summary: true })
 * @returns {{ signal, strength, score, reasons, meta }}
 */
export function detectSignal(ohlcv) {
  const { open, high, low, avg_volume, last_5_bars } = ohlcv;

  if (!last_5_bars || last_5_bars.length < 2) {
    return { signal: 'NEUTRAL', strength: 'NORMAL', score: 0, reasons: [], meta: {} };
  }

  const today     = last_5_bars[last_5_bars.length - 1];
  const yesterday = last_5_bars[last_5_bars.length - 2];
  const rangeSize = high - low;

  // Vị trí giá trong range 60 phiên (0 = ở đáy, 1 = ở đỉnh)
  const positionInRange = rangeSize > 0 ? (today.close - low) / rangeSize : 0.5;

  // Tỷ lệ KL so với TB
  const volumeRatio = avg_volume > 0 ? today.volume / avg_volume : 1;

  // Phân tích nến
  const isBullishToday     = today.close > today.open;
  const isBearishToday     = today.close < today.open;
  const isBullishYesterday = yesterday.close > yesterday.open;
  const isBearishYesterday = yesterday.close < yesterday.open;

  // Vị trí đóng cửa trong ngày (0 = ở đáy ngày, 1 = ở đỉnh ngày)
  const dayRange     = today.high - today.low;
  const closeInDay   = dayRange > 0 ? (today.close - today.low) / dayRange : 0.5;

  // Thay đổi % so với hôm qua
  const dayChangePct = ((today.close - yesterday.close) / yesterday.close * 100).toFixed(2);

  let buyScore  = 0;
  let sellScore = 0;
  const buyReasons  = [];
  const sellReasons = [];

  // ─── BUY SIGNALS ─────────────────────────────────────────────────────────

  if (positionInRange <= oversoldPct) {
    buyScore += 2;
    buyReasons.push(`📍 Giá gần đáy 60 phiên (vị trí ${(positionInRange * 100).toFixed(0)}%)`);
  } else if (positionInRange <= 0.35) {
    buyScore += 1;
    buyReasons.push(`📍 Giá vùng thấp (vị trí ${(positionInRange * 100).toFixed(0)}%)`);
  }

  if (isBullishToday) {
    const candlePct = ((today.close - today.open) / today.open * 100).toFixed(1);
    buyScore += 1;
    buyReasons.push(`🕯️ Nến xanh +${candlePct}%`);
  }

  if (isBullishToday && isBullishYesterday) {
    buyScore += 1;
    buyReasons.push(`📈 2 phiên xanh liên tiếp — đà tăng đang hình thành`);
  }

  if (volumeRatio >= volumeMultiplier && isBullishToday) {
    buyScore += 1;
    buyReasons.push(`📊 KL = ${volumeRatio.toFixed(1)}x TB + nến xanh → cầu mua mạnh`);
  }

  if (closeInDay >= 0.7) {
    buyScore += 1;
    buyReasons.push(`💪 Đóng cửa cao trong ngày (${(closeInDay * 100).toFixed(0)}% day range)`);
  }

  // Bounce từ đáy: giá mở thấp nhưng đóng cao hơn hôm qua
  if (today.open <= yesterday.close && today.close > yesterday.close && isBullishToday) {
    buyScore += 1;
    buyReasons.push(`🔄 Bật ngược từ vùng hỗ trợ`);
  }

  // ─── SELL SIGNALS ────────────────────────────────────────────────────────

  if (positionInRange >= (1 - overboughtPct)) {
    sellScore += 2;
    sellReasons.push(`⛰️ Giá gần đỉnh 60 phiên (vị trí ${(positionInRange * 100).toFixed(0)}%)`);
  } else if (positionInRange >= 0.75) {
    sellScore += 1;
    sellReasons.push(`⛰️ Giá vùng cao (vị trí ${(positionInRange * 100).toFixed(0)}%)`);
  }

  if (isBearishToday) {
    const candlePct = ((today.close - today.open) / today.open * 100).toFixed(1);
    sellScore += 1;
    sellReasons.push(`🕯️ Nến đỏ ${candlePct}%`);
  }

  if (isBearishToday && isBearishYesterday) {
    sellScore += 1;
    sellReasons.push(`📉 2 phiên đỏ liên tiếp — áp lực bán kéo dài`);
  }

  if (volumeRatio >= volumeMultiplier && isBearishToday) {
    sellScore += 1;
    sellReasons.push(`📊 KL = ${volumeRatio.toFixed(1)}x TB + nến đỏ → bán tháo mạnh`);
  }

  if (closeInDay <= 0.3) {
    sellScore += 1;
    sellReasons.push(`⚠️ Đóng cửa thấp trong ngày (${(closeInDay * 100).toFixed(0)}% day range)`);
  }

  // Reversal đỉnh: giá mở cao nhưng đóng thấp hơn hôm qua
  if (today.open >= yesterday.close && today.close < yesterday.close && isBearishToday) {
    sellScore += 1;
    sellReasons.push(`🔄 Đảo chiều từ vùng kháng cự`);
  }

  // ─── DETERMINE FINAL SIGNAL ──────────────────────────────────────────────

  let signal, strength, score, reasons;

  if (buyScore >= 2 && buyScore > sellScore) {
    signal   = 'BUY';
    strength = buyScore >= 4 ? 'STRONG' : 'NORMAL';
    score    = buyScore;
    reasons  = buyReasons;
  } else if (sellScore >= 2 && sellScore > buyScore) {
    signal   = 'SELL';
    strength = sellScore >= 4 ? 'STRONG' : 'NORMAL';
    score    = sellScore;
    reasons  = sellReasons;
  } else if (Math.max(buyScore, sellScore) === 1) {
    signal   = 'WATCH';
    strength = 'NORMAL';
    score    = Math.max(buyScore, sellScore);
    reasons  = buyScore > sellScore ? buyReasons : sellReasons;
  } else {
    signal   = 'NEUTRAL';
    strength = 'NORMAL';
    score    = 0;
    reasons  = [];
  }

  return {
    signal,
    strength,
    score,
    reasons,
    meta: {
      price:           today.close,
      dayChangePct,
      volume:          today.volume,
      volumeRatio:     volumeRatio.toFixed(1),
      positionInRange: (positionInRange * 100).toFixed(0),
      high60d:         high,
      low60d:          low,
    },
  };
}
