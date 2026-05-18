/**
 * Market Indices — Lấy dữ liệu chỉ số từ SSI iBoard API
 * Các chỉ số: VNINDEX, VN30, HNX30, VNXALL, HNXINDEX, HNXUPCOMING
 */

const SSI_HEADERS = {
  'accept':           'application/json, text/plain, */*',
  'accept-language':  'vi',
  'cache-control':    'no-cache',
  'device-id':        '95A6EE63-2C48-4868-AA89-30FB99CA011B',
  'origin':           'https://iboard.ssi.com.vn',
  'pragma':           'no-cache',
  'referer':          'https://iboard.ssi.com.vn/',
  'user-agent':       'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
  'x-device-name':   'Chrome',
  'x-os-name':       'Windows',
};

const INDICES = [
  { id: 'VNINDEX',     label: 'VNINDEX'     },
  { id: 'VN30',        label: 'VN30'        },
  { id: 'HNX30',       label: 'HNX30'       },
  { id: 'VNXALL',      label: 'VNXALL'      },
  { id: 'HNXINDEX',    label: 'HNXINDEX'    },
  { id: 'HNXUPCOMING', label: 'HNXUPCOMING' },
];

async function fetchIndex(id) {
  const url  = `https://iboard-query.ssi.com.vn/exchange-index/${id}?hasHistory=true`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res  = await fetch(url, { headers: SSI_HEADERS, signal: ctrl.signal });
    const json = await res.json();
    return json?.data || json;
  } finally {
    clearTimeout(timer);
  }
}

function fmt(val, decimals = 2) {
  if (val == null || val === '') return '—';
  const n = parseFloat(val);
  if (isNaN(n)) return '—';
  return n.toFixed(decimals);
}

function fmtVolume(val) {
  if (val == null) return '—';
  const n = parseFloat(val);
  if (isNaN(n)) return '—';
  // đơn vị triệu
  return (n / 1_000_000).toFixed(3);
}

function fmtValue(val) {
  if (val == null) return '—';
  const n = parseFloat(val);
  if (isNaN(n)) return '—';
  // đơn vị tỷ
  return (n / 1_000_000_000).toFixed(3);
}

function changeEmoji(change) {
  const n = parseFloat(change);
  if (isNaN(n) || n === 0) return '▬';
  return n > 0 ? '🟢' : '🔴';
}

/**
 * Lấy tất cả chỉ số và trả về mảng đã format
 */
export async function fetchAllIndices() {
  const results = await Promise.allSettled(
    INDICES.map(async ({ id, label }) => {
      const data = await fetchIndex(id);
      return { id, label, data };
    })
  );

  return results.map((r, i) => {
    if (r.status === 'rejected') {
      return { label: INDICES[i].label, error: r.reason?.message || 'Lỗi' };
    }
    const { label, data } = r.value;
    return {
      label,
      indexValue: fmt(data?.indexValue ?? data?.index ?? data?.lastPrice),
      change:     fmt(data?.change ?? data?.indexChange),
      changePct:  fmt(data?.percentChange ?? data?.changePercent ?? data?.pctChange),
      volume:     fmtVolume(data?.allQty      ?? data?.totalVolume ?? data?.volume),
      value:      fmtValue(data?.allValue    ?? data?.totalValue  ?? data?.value),
      advances:   data?.advances  ?? '—',
      nochanges:  data?.nochanges ?? '—',
      declines:   data?.declines  ?? '—',
    };
  });
}

/**
 * Format bảng chỉ số gửi Telegram (MarkdownV2-safe plain text)
 */
export function formatIndicesMessage(indices) {
  const now = new Date().toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const lines = [
    `📊 *CHỈ SỐ THỊ TRƯỜNG*`,
    `📅 ${now}`,
    ``,
    `\`${'Chỉ số'.padEnd(12)} ${'Điểm'.padStart(9)} ${'±'.padStart(7)} ${'%'.padStart(6)}\``,
    `\`${'─'.repeat(38)}\``,
  ];

  for (const idx of indices) {
    if (idx.error) {
      lines.push(`\`${idx.label.padEnd(12)} ❌ ${idx.error.slice(0, 20)}\``);
      continue;
    }

    const sign   = parseFloat(idx.change) >= 0 ? '+' : '';
    const emoji  = changeEmoji(idx.change);
    const point  = idx.indexValue.padStart(9);
    const chg    = (sign + idx.change).padStart(7);
    const pct    = (sign + idx.changePct + '%').padStart(7);

    lines.push(`${emoji} \`${idx.label.padEnd(12)}${point} ${chg} ${pct}\``);
  }

  lines.push(``);
  lines.push(`\`${'─'.repeat(38)}\``);
  lines.push(`\`${'Chỉ số'.padEnd(12)} ${'KLGD(Tr)'.padStart(10)} ${'GTGD(Tỷ)'.padStart(10)}\``);
  lines.push(`\`${'─'.repeat(38)}\``);

  for (const idx of indices) {
    if (idx.error) continue;
    lines.push(`\`${idx.label.padEnd(12)}${idx.volume.padStart(10)} ${idx.value.padStart(10)}\``);
  }

  lines.push(``);
  lines.push(`\`${'─'.repeat(38)}\``);
  lines.push(`\`${'Chỉ số'.padEnd(12)} ${'🟢Tăng'.padStart(7)} ${'▬SL'.padStart(5)} ${'🔴Giảm'.padStart(7)}\``);
  lines.push(`\`${'─'.repeat(38)}\``);

  for (const idx of indices) {
    if (idx.error) continue;
    const adv = String(idx.advances).padStart(7);
    const unc = String(idx.nochanges).padStart(5);
    const dec = String(idx.declines).padStart(7);
    lines.push(`\`${idx.label.padEnd(12)}${adv} ${unc} ${dec}\``);
  }

  return lines.join('\n');
}
