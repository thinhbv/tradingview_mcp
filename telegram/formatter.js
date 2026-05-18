/**
 * Định dạng tin nhắn Telegram
 */

const SIGNAL_EMOJI = {
  BUY:     { STRONG: '🔥🟢', NORMAL: '✅' },
  SELL:    { STRONG: '🔥🔴', NORMAL: '🔴' },
  WATCH:   { STRONG: '👀',   NORMAL: '👀' },
  NEUTRAL: { STRONG: '⬜',   NORMAL: '⬜' },
};

const SIGNAL_LABEL = {
  BUY:     { STRONG: 'STRONG BUY — MUA MẠNH',  NORMAL: 'BUY — NÊN MUA'     },
  SELL:    { STRONG: 'STRONG SELL — BÁN MẠNH', NORMAL: 'SELL — NÊN BÁN'    },
  WATCH:   { STRONG: 'WATCH — THEO DÕI',        NORMAL: 'WATCH — THEO DÕI'  },
  NEUTRAL: { STRONG: 'NEUTRAL',                 NORMAL: 'NEUTRAL'           },
};

function formatPrice(price) {
  return price?.toLocaleString('vi-VN') + ' VNĐ';
}

function formatVolume(volume) {
  if (volume >= 1_000_000) return (volume / 1_000_000).toFixed(1) + 'M';
  if (volume >= 1_000)     return (volume / 1_000).toFixed(0) + 'K';
  return volume?.toString() ?? '—';
}

function formatChange(pct) {
  const n = parseFloat(pct);
  return n >= 0 ? `+${pct}%` : `${pct}%`;
}

/**
 * Định dạng tin nhắn alert cho một mã
 */
export function formatSignalMessage(result) {
  const { symbol, signal, strength, score, reasons, meta } = result;

  if (result.error) {
    return `⚠️ *${symbol}* — Không lấy được dữ liệu\n_${result.error}_`;
  }

  const emoji = SIGNAL_EMOJI[signal]?.[strength] ?? '⬜';
  const label = SIGNAL_LABEL[signal]?.[strength] ?? signal;
  const ticker = symbol.replace('HOSE:', '').replace('HNX:', '');
  const changeStr = formatChange(meta.dayChangePct);
  const changeEmoji = parseFloat(meta.dayChangePct) >= 0 ? '🟢' : '🔴';

  const reasonsList = reasons.map(r => `  • ${r}`).join('\n');

  return `${emoji} *${ticker}* — ${label}

💰 Giá: *${formatPrice(meta.price)}* ${changeEmoji} ${changeStr}
📊 KL: ${formatVolume(meta.volume)} (${meta.volumeRatio}x TB)
📍 Vị trí range 60p: *${meta.positionInRange}%* (đáy → đỉnh)
   Đáy: ${formatPrice(meta.low60d)} | Đỉnh: ${formatPrice(meta.high60d)}

*Lý do (điểm: ${score}):*
${reasonsList}

_⏰ ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}_`;
}

/**
 * Định dạng tổng hợp khi scan toàn bộ watchlist
 */
export function formatScanSummary(results) {
  const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

  const buy    = results.filter(r => r.signal === 'BUY');
  const sell   = results.filter(r => r.signal === 'SELL');
  const watch  = results.filter(r => r.signal === 'WATCH');
  const others = results.filter(r => !['BUY','SELL','WATCH'].includes(r.signal));

  let msg = `📊 *KẾT QUẢ SCAN — ${now}*\n`;
  msg += `Tổng: ${results.length} mã | 🟢 ${buy.length} mua | 🔴 ${sell.length} bán | 👀 ${watch.length} theo dõi\n\n`;

  if (buy.length > 0) {
    msg += `─── 🟢 NÊN MUA ───\n`;
    for (const r of buy) {
      const ticker = r.symbol.replace('HOSE:', '').replace('HNX:', '');
      const str    = r.strength === 'STRONG' ? ' 🔥' : '';
      const chg    = formatChange(r.meta?.dayChangePct ?? '0');
      msg += `${str}*${ticker}* ${formatPrice(r.meta?.price)} (${chg}) — ${r.score} pts\n`;
    }
    msg += '\n';
  }

  if (sell.length > 0) {
    msg += `─── 🔴 NÊN BÁN ───\n`;
    for (const r of sell) {
      const ticker = r.symbol.replace('HOSE:', '').replace('HNX:', '');
      const str    = r.strength === 'STRONG' ? ' 🔥' : '';
      const chg    = formatChange(r.meta?.dayChangePct ?? '0');
      msg += `${str}*${ticker}* ${formatPrice(r.meta?.price)} (${chg}) — ${r.score} pts\n`;
    }
    msg += '\n';
  }

  if (watch.length > 0) {
    msg += `─── 👀 THEO DÕI ───\n`;
    for (const r of watch) {
      const ticker = r.symbol.replace('HOSE:', '').replace('HNX:', '');
      const chg    = formatChange(r.meta?.dayChangePct ?? '0');
      msg += `*${ticker}* ${formatPrice(r.meta?.price)} (${chg})\n`;
    }
    msg += '\n';
  }

  if (others.length > 0) {
    msg += `─── ⬜ TRUNG TÍNH ───\n`;
    for (const r of others) {
      const ticker = r.symbol.replace('HOSE:', '').replace('HNX:', '');
      if (r.error) {
        msg += `*${ticker}* — ❌ ${r.error}\n`;
      } else {
        const chg = formatChange(r.meta?.dayChangePct ?? '0');
        msg += `*${ticker}* ${formatPrice(r.meta?.price)} (${chg})\n`;
      }
    }
  }

  return msg;
}
