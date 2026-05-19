# SOURCE_INDEX — TradingView MCP

> Cập nhật: 2026-05-18 | Phiên bản: MCP 2.0.0

Tài liệu tham chiếu toàn bộ source code của project. Mỗi file được mô tả: mục đích, exports chính, dependencies.

---

## Mục lục

1. [Cấu trúc tổng quan](#1-cấu-trúc-tổng-quan)
2. [Cấu hình gốc](#2-cấu-hình-gốc)
3. [Server & Connection Layer](#3-server--connection-layer)
4. [Core Modules](#4-core-modules)
5. [MCP Tool Registration](#5-mcp-tool-registration)
6. [CLI Interface](#6-cli-interface)
7. [Telegram Signal Bot](#7-telegram-signal-bot)
8. [Scripts tiện ích](#8-scripts-tiện-ích)
9. [Tests](#9-tests)
10. [Tài liệu](#10-tài-liệu)
11. [Luồng dữ liệu & kiến trúc](#11-luồng-dữ-liệu--kiến-trúc)

---

## 1. Cấu trúc tổng quan

```
tradingview_mcp/
├── src/
│   ├── server.js              ← MCP server entry point
│   ├── connection.js          ← CDP connection manager
│   ├── wait.js                ← Chart readiness polling
│   ├── core/                  ← Business logic (13 modules)
│   └── tools/                 ← MCP tool registration (14 groups)
│   └── cli/                   ← CLI interface (tv command)
├── telegram/                  ← Telegram Signal Bot
│   ├── index.js               ← Bot entry point
│   ├── bot.js                 ← Command handlers
│   ├── config.js              ← Centralized config
│   ├── scanner.js             ← Watchlist auto-scanner
│   ├── signals.js             ← Signal detection algorithm
│   ├── formatter.js           ← Message formatting
│   ├── subscribers.js         ← Subscriber persistence
│   ├── env_writer.js          ← .env dynamic writer
│   └── news/
│       ├── scheduler.js       ← News cron + morning digest
│       ├── market_indices.js  ← VNIndex, HNX fetch & format
│       ├── scraper.js         ← Web scraping
│       ├── text_extractor.js  ← HTML → plain text
│       └── ai_reader.js       ← Claude API integration
├── scripts/
│   ├── pine_pull.js           ← Export Pine Script from editor
│   └── pine_push.js           ← Inject Pine Script to editor
├── tests/                     ← Test suite (5 files)
├── docs/                      ← Tài liệu (folder này)
├── .env                       ← Biến môi trường (git-ignored)
├── .env.example               ← Template
└── package.json
```

**Thống kê nhanh:**
- MCP tools: **78 tools** trong 14 nhóm
- Core modules: **13 modules**
- CLI commands: **50+**
- Telegram commands: **15+**
- Lines of code: ~8,000 (không tính node_modules)

---

## 2. Cấu hình gốc

### `package.json`
Entry points và dependencies chính:

| Mục | Giá trị |
|-----|---------|
| MCP server | `src/server.js` |
| CLI | `src/cli/index.js` (lệnh `tv`) |
| Telegram bot | `telegram/index.js` (`npm run telegram`) |

**Dependencies quan trọng:**

| Package | Dùng để |
|---------|---------|
| `@modelcontextprotocol/sdk` | MCP protocol |
| `@anthropic-ai/sdk` | Claude API (phân tích tin tức) |
| `chrome-remote-interface` | CDP client |
| `node-telegram-bot-api` | Telegram bot |
| `node-cron` | Lịch gửi tin sáng |
| `cheerio` | Scrape HTML tin tức |
| `dotenv` | Đọc `.env` |

### `.env.example`
Template biến môi trường:

```env
TELEGRAM_TOKEN=          # Token từ @BotFather
TELEGRAM_CHAT_ID=        # Chat ID nhận tín hiệu

ANTHROPIC_API_KEY=       # Key Claude API (cho /deepnews)

# Bản tin sáng tự động (true/false)
MORNING_BASIC_NEWS=true
MORNING_DEEP_NEWS=false
MORNING_VNINDEX=false
```

> `MORNING_*` có thể thay đổi runtime bằng lệnh `/morning on|off` — tự ghi vào `.env`.

---

## 3. Server & Connection Layer

### `src/server.js`
**MCP server** — khởi tạo và đăng ký 78 tools.

- Gọi tất cả `register*Tools(server)` từ `src/tools/`
- Dùng stdio transport để Claude Code giao tiếp
- Chứa tool selection guide cho Claude (CLAUDE.md)

### `src/connection.js`
**CDP connection manager** — cầu nối duy nhất đến TradingView Desktop.

| Export | Mô tả |
|--------|-------|
| `getClient()` | Lấy hoặc tạo CDP client (có liveness check) |
| `connect()` | Kết nối với retry (5 lần, exponential backoff) |
| `evaluate(expr, opts)` | Chạy JS trong page context |
| `evaluateAsync(expr)` | Chạy JS async (await promise) |
| `safeString(str)` | Sanitize string trước khi inject vào JS |
| `requireFinite(val, name)` | Validate số hữu hạn (chặn NaN/Infinity) |
| `KNOWN_PATHS` | Đường dẫn đã khám phá đến TradingView internal API |
| `getChartApi()` | Verify và trả về chart API path |

**Cấu hình:**
- Host: `localhost`, Port: `9222`
- Max retries: 5, Base delay: 500ms

**KNOWN_PATHS** — các API nội bộ của TradingView:

| Key | Path |
|-----|------|
| `chartApi` | `window.TradingViewApi._activeChartWidgetWV.value()` |
| `chartWidgetCollection` | `window.TradingViewApi._chartWidgetCollection` |
| `replayApi` | `window.TradingViewApi._replayApi` |
| `mainSeriesBars` | OHLC bar data |
| `layoutManager` | Saved charts/layouts |

### `src/wait.js`
**Chart readiness polling** — đợi chart load xong sau khi đổi symbol/timeframe.

| Export | Mô tả |
|--------|-------|
| `waitForChartReady(symbol, tf, timeout)` | Poll đến khi chart ổn định |

Logic: phát hiện loading spinner → kiểm tra bar count ổn định (2 lần liên tiếp) → verify symbol khớp.

---

## 4. Core Modules

### `src/core/index.js`
Re-export namespace cho tất cả core modules. Dùng trong scanner và scripts:
```js
import * as core from 'tradingview-mcp/core';
core.chart.setSymbol({ symbol: 'AAPL' });
```

---

### `src/core/chart.js` — Điều khiển chart

| Function | Params | Mô tả |
|----------|--------|-------|
| `getState()` | — | Symbol, timeframe, chart type, danh sách indicators + entity IDs |
| `setSymbol()` | `{symbol}` | Đổi mã chứng khoán |
| `setTimeframe()` | `{timeframe}` | Đổi khung thời gian (`"1"`, `"15"`, `"D"`, `"W"`) |
| `setType()` | `{chart_type}` | Đổi kiểu chart (Candles, Line, HeikinAshi...) |
| `manageIndicator()` | `{action, indicator, entity_id, inputs}` | Thêm/xóa/cập nhật indicator |
| `getVisibleRange()` | — | Dải ngày đang hiển thị (unix timestamp) |
| `setVisibleRange()` | `{from, to}` | Zoom đến khoảng ngày cụ thể |
| `scrollToDate()` | `{date}` | Cuộn đến ngày (ISO format) |
| `symbolInfo()` | — | Metadata: exchange, type, description |
| `symbolSearch()` | `{query, type}` | Tìm kiếm mã |

---

### `src/core/data.js` — Đọc dữ liệu

| Function | Params | Mô tả |
|----------|--------|-------|
| `getOhlcv()` | `{count, summary}` | Lấy bars (tối đa 500); `summary:true` → compact stats |
| `getIndicator()` | `{entity_id}` | Giá trị + inputs của indicator |
| `getStrategyResults()` | — | Metrics Strategy Tester |
| `getTrades()` | `{max_trades}` | Danh sách lệnh từ Strategy Tester |
| `getEquity()` | — | Đường equity curve |
| `getQuote()` | `{symbol}` | Giá realtime (OHLC, volume) |
| `getDepth()` | — | DOM (Depth of Market) |
| `getPineLines()` | `{study_filter, verbose}` | Các mức giá ngang từ Pine (`line.new`) |
| `getPineLabels()` | `{study_filter, max_labels}` | Text annotations từ Pine (`label.new`) |
| `getPineTables()` | `{study_filter}` | Dữ liệu bảng từ Pine (`table.new`) |
| `getPineBoxes()` | `{study_filter}` | Vùng giá từ Pine (`box.new`) |

> Pine graphics tools chỉ hoạt động khi indicator đang **visible** trên chart.

---

### `src/core/pine.js` — Pine Script editor

| Function | Mô tả |
|----------|-------|
| `getSource()` | Đọc code hiện tại trong editor |
| `setSource({source})` | Inject Pine code vào editor |
| `compile()` | Compile và thêm vào chart |
| `getErrors()` | Lỗi compilation từ Monaco markers |
| `getConsole()` | Output `log.info()` |
| `save()` | Lưu lên cloud (Ctrl+S) |
| `smartCompile()` | Compile + auto-detect + report thay đổi |
| `newScript({type})` | Tạo script trống (indicator/strategy/library) |
| `openScript({name})` | Mở script đã lưu |
| `listScripts()` | Danh sách scripts đã lưu |
| `analyze({source})` | Static analysis (array bounds, implicit bool) |
| `check({source})` | Compile offline qua TradingView server API |

---

### `src/core/replay.js` — Bar Replay

| Function | Params | Mô tả |
|----------|--------|-------|
| `start()` | `{date}` | Bắt đầu replay từ ngày (ISO) |
| `step()` | — | Tiến 1 bar |
| `autoplay()` | `{speed}` | Tự động chạy (delay hợp lệ: 100–10000ms) |
| `trade()` | `{action}` | Đặt lệnh: `buy`/`sell`/`close` |
| `status()` | — | Trạng thái, P&L, ngày hiện tại |
| `stop()` | — | Thoát replay |

> Delay autoplay hợp lệ: `[100, 143, 200, 300, 1000, 2000, 3000, 5000, 10000]` ms.

---

### `src/core/batch.js` — Batch Operations

| Function | Params | Mô tả |
|----------|--------|-------|
| `batchRun()` | `{symbols, timeframes, action, delay_ms}` | Chạy action trên nhiều symbol/timeframe |

**Actions:** `screenshot`, `get_ohlcv`, `get_strategy_results`

Screenshots lưu vào `screenshots/batch_SYMBOL_TF_TIMESTAMP.png`.

---

### `src/core/capture.js` — Screenshot

| Region | Mô tả |
|--------|-------|
| `full` | Toàn bộ cửa sổ TradingView |
| `chart` | Chỉ vùng chart canvas |
| `strategy_tester` | Panel Strategy Tester |

Output: `screenshots/tv_REGION_TIMESTAMP.png`

---

### `src/core/health.js` — Health & Launch

| Function | Mô tả |
|----------|-------|
| `healthCheck()` | Verify CDP connection + chart state |
| `discover()` | Probe TradingView APIs (trả về method counts) |
| `uiState()` | Trạng thái UI panels |
| `launch()` | Auto-detect và launch TradingView với CDP port 9222 |

`launch()` hỗ trợ Mac/Windows/Linux, tự tìm path cài đặt.

---

### `src/core/drawing.js` — Vẽ trên chart

| Shape | Mô tả |
|-------|-------|
| `horizontal_line` | Đường ngang |
| `vertical_line` | Đường dọc |
| `trend_line` | Đường xu hướng (2 điểm) |
| `rectangle` | Hình chữ nhật |
| `text` | Text label |

Points format: `{time: unix_timestamp, price: number}`

---

### `src/core/alerts.js` — Price Alerts

Conditions: `crossing`, `greater_than`, `less_than`, ...

---

### `src/core/indicators.js` — Indicator Settings

| Function | Mô tả |
|----------|-------|
| `setInputs({entity_id, inputs})` | Thay đổi params (length, source...) |
| `toggleVisibility({entity_id, visible})` | Ẩn/hiện indicator |

---

### `src/core/ui.js` — UI Automation

| Function | Mô tả |
|----------|-------|
| `click({by, value})` | Click element (by: aria-label, data-name, text, class) |
| `openPanel({panel, action})` | Mở/đóng panel |
| `hover()`, `keyboard()`, `typeText()`, `scroll()` | UI interactions |
| `fullscreen()` | Toggle fullscreen |

Panels: `pine-editor`, `strategy-tester`, `watchlist`, `alerts`, `trading`

---

### `src/core/pane.js` — Multi-pane Layout

Layout codes: `s` (single), `2h`, `2v`, `4` (2×2), `6`, `8`, `10`, `12`...

---

### `src/core/tab.js` — Chart Tabs

`tab_list`, `tab_new` (Ctrl+T), `tab_close` (Ctrl+W), `tab_switch`

---

### `src/core/stream.js` — Real-time Streaming

Output JSONL ra stdout, chỉ emit khi data thay đổi.

| Stream | Default interval |
|--------|-----------------|
| `streamQuote` | 300ms |
| `streamBars` | 1000ms |
| `streamValues` | 500ms |
| `streamLines/Labels/Tables` | 2000ms |
| `streamAllPanes` | 1000ms |

---

## 5. MCP Tool Registration

Mỗi file trong `src/tools/` đăng ký tools vào MCP server theo pattern:
```js
server.tool('tool_name', 'Description', { param: z.schema() }, handler)
```

| File | Tools đăng ký |
|------|--------------|
| `chart.js` | `chart_get_state`, `chart_set_symbol`, `chart_set_timeframe`, `chart_set_type`, `chart_manage_indicator`, `chart_get/set_visible_range`, `chart_scroll_to_date`, `symbol_info`, `symbol_search` |
| `data.js` | `data_get_ohlcv`, `data_get_indicator`, `data_get_strategy_results`, `data_get_trades`, `data_get_equity`, `quote_get`, `depth_get`, `data_get_pine_lines/labels/tables/boxes` |
| `pine.js` | `pine_get/set_source`, `pine_compile`, `pine_get_errors`, `pine_save`, `pine_get_console`, `pine_smart_compile`, `pine_new`, `pine_open`, `pine_list_scripts`, `pine_analyze`, `pine_check` |
| `capture.js` | `capture_screenshot` |
| `drawing.js` | `draw_shape`, `draw_list`, `draw_get_properties`, `draw_remove_one`, `draw_clear` |
| `alerts.js` | `alert_create`, `alert_list`, `alert_delete` |
| `batch.js` | `batch_run` |
| `replay.js` | `replay_start`, `replay_step`, `replay_autoplay`, `replay_status`, `replay_stop`, `replay_trade` |
| `watchlist.js` | `watchlist_get`, `watchlist_add` |
| `indicators.js` | `indicator_set_inputs`, `indicator_toggle_visibility` |
| `ui.js` | `ui_click`, `ui_hover`, `ui_keyboard`, `ui_type_text`, `ui_scroll`, `ui_open_panel`, `ui_fullscreen`, `ui_find_element`, `ui_evaluate` |
| `health.js` | `tv_health_check`, `tv_discover`, `tv_launch`, `tv_ui_state` |
| `pane.js` | `pane_list`, `pane_set_layout`, `pane_focus`, `pane_set_symbol` |
| `tab.js` | `tab_list`, `tab_new`, `tab_close`, `tab_switch` |
| `_format.js` | Helper: `jsonResult(obj, isError)` |

**Tổng: 78 tools**

---

## 6. CLI Interface

### `src/cli/index.js`
Entry point CLI. Shebang `#!/usr/bin/env node`. Đăng ký tất cả commands rồi gọi `router.run(process.argv)`.

Lệnh: `npm run tv` hoặc `tv` (sau khi link global).

### `src/cli/router.js`

| Export | Mô tả |
|--------|-------|
| `register(name, config)` | Đăng ký command |
| `run(argv)` | Parse và thực thi |

- Parser: `node:util.parseArgs` (zero dependency)
- Hỗ trợ subcommands: `tv pine get`, `tv chart set-symbol AAPL`
- Exit codes: 0 (ok), 1 (lỗi), 2 (không kết nối được)

### `src/cli/commands/`
Mỗi file map 1:1 với core module. Đọc flags từ argv → gọi core function → in JSON ra stdout.

---

## 7. Telegram Signal Bot

### `telegram/index.js` — Entry point
```bash
node telegram/index.js
# hoặc
npm run telegram
```

**Startup sequence:**
1. Validate `TELEGRAM_TOKEN` + `TELEGRAM_CHAT_ID`
2. `createBot()` — khởi động bot
3. `startNewsScheduler(sendAlert, '0 9 * * 1-5')` — lịch bản tin sáng
4. `startAutoScanner()` — scan watchlist định kỳ

---

### `telegram/bot.js` — Command Handler

**Commands cho tất cả (private + group):**

| Command | Mô tả |
|---------|-------|
| `/scan` | Quét watchlist ngay |
| `/news` | Tin tức cơ bản (CafeF + VnExpress) |
| `/deepnews [SYMBOL]` | Tin chuyên sâu AI (Claude) |
| `/vnindex` | Chỉ số VNIndex, HNX, UPCOM |
| `/list` | Xem watchlist |
| `/watch SYMBOL` | Thêm mã |
| `/unwatch SYMBOL` | Xóa mã |
| `/status` | Trạng thái bot |
| `/help` | Hướng dẫn |

**Private only:**

| Command | Mô tả |
|---------|-------|
| `/start` | Đăng ký nhận tín hiệu |
| `/stop` | Hủy đăng ký |

**Group only (admin group):**

| Command | Mô tả |
|---------|-------|
| `/subscribe` | Đăng ký group |
| `/leave` | Hủy đăng ký group |

**Admin only (owner bot):**

| Command | Mô tả |
|---------|-------|
| `/members` | Xem danh sách subscriber |
| `/broadcast MESSAGE` | Gửi đến tất cả |
| `/morning [on\|off] [news\|deepnews\|vnindex]` | Bật/tắt bản tin sáng |

**Key exports:**
- `createBot()` — khởi tạo bot
- `sendAlert(message)` — gửi đến tất cả subscriber
- `sendToAdmin(message)` — gửi riêng admin
- `getWatchlist()` — watchlist hiện tại

---

### `telegram/config.js` — Centralized Config

```js
config.telegram.token         // TELEGRAM_TOKEN
config.telegram.chatId        // TELEGRAM_CHAT_ID

config.scanner.intervalMs     // 30 phút
config.scanner.marketOpenHour / marketOpenMinute   // 9:15
config.scanner.marketCloseHour / marketCloseMinute // 14:45
config.scanner.watchlist      // [FPT, VCB, TCB, HPG, MWG, SHB, VHM, MBB]
config.scanner.delayBetweenSymbols  // 4000ms

// Đọc live từ process.env (dùng getter):
config.morning.basicNews      // MORNING_BASIC_NEWS (default: true)
config.morning.deepNews       // MORNING_DEEP_NEWS  (default: false)
config.morning.vnindex        // MORNING_VNINDEX    (default: false)

config.signals.oversoldPct    // 0.20 — vùng đáy 60 phiên → BUY
config.signals.overboughtPct  // 0.08 — vùng đỉnh 60 phiên → SELL
config.signals.volumeMultiplier // 1.3x
config.signals.minScore       // 2
```

---

### `telegram/scanner.js` — Auto Scanner

| Function | Mô tả |
|----------|-------|
| `scanSymbol(symbol)` | Đổi chart, lấy dữ liệu, phát hiện tín hiệu |
| `scanAll(symbols)` | Scan tuần tự tất cả mã |
| `isMarketOpen()` | Kiểm tra 9:15–14:45 T2-T6 (VN time) |
| `startAutoScanner(onSignal, getWatchlist)` | Lên lịch scan định kỳ |

Dùng `core.chart` + `core.data` → đọc từ CDP → gọi `signals.js`.

---

### `telegram/signals.js` — Signal Detection

**Output:** `{signal, strength, score, reasons, meta}`

| Signal | Điều kiện |
|--------|-----------|
| `BUY` | Gần đáy 60 phiên (score ≥ 2) |
| `SELL` | Gần đỉnh 60 phiên (score ≥ 2) |
| `WATCH` | Khối lượng bất thường nhưng chưa đủ điểm |
| `NEUTRAL` | Không có tín hiệu đặc biệt |

**Scoring:**

| Điều kiện | Điểm |
|-----------|------|
| Trong vùng đáy 20% của 60 phiên | +2 (BUY) |
| Trong vùng đỉnh 8% của 60 phiên | +2 (SELL) |
| Nến xanh | +1 BUY |
| Nến đỏ | +1 SELL |
| KL > 1.3x trung bình + xanh | +1 BUY |
| KL > 1.3x trung bình + đỏ | +1 SELL |
| Đóng cửa cao trong ngày (>70%) | +1 BUY |
| Đóng cửa thấp trong ngày (<30%) | +1 SELL |

**Strength:** `STRONG` (score ≥ 4), `NORMAL` (score 2–3)

---

### `telegram/news/scheduler.js` — News Scheduler

| Export | Mô tả |
|--------|-------|
| `sendMorningDigest(sendFn)` | Gửi bản tin sáng (tin cơ bản + deepnews + vnindex nếu bật) |
| `sendDeepNews(symbol, sendFn)` | Tin chuyên sâu 1 mã qua Claude API |
| `startNewsScheduler(sendFn, cron)` | Lên lịch cron (default: `0 9 * * 1-5`) |
| `stopNewsScheduler()` | Dừng scheduler |

**Nguồn tin:**
- CafeF: `https://cafef.vn/thi-truong-chung-khoan.chn`
- VnExpress: `https://vnexpress.net/kinh-doanh/chung-khoan`

**Flow bản tin sáng:**
1. Fetch HTML → parse tiêu đề (Cheerio)
2. Gửi tiêu đề vào Claude Haiku → tóm tắt 5–7 tin
3. Gửi Telegram
4. Nếu `MORNING_VNINDEX=true` → fetch + gửi chỉ số
5. Nếu `MORNING_DEEP_NEWS=true` → deepnews cho từng mã trong watchlist

---

### `telegram/news/market_indices.js` — Market Indices

Fetch từ SSI iBoard API: `https://iboard-query.ssi.com.vn/exchange-index/{ID}`

**Chỉ số:** VNINDEX, VN30, HNX30, VNXALL, HNXINDEX, HNXUPCOMING

| Export | Mô tả |
|--------|-------|
| `fetchAllIndices()` | Fetch song song tất cả chỉ số |
| `formatIndicesMessage(indices)` | Format bảng Markdown gửi Telegram |

---

### `telegram/subscribers.js` — Subscriber Management

Storage: `telegram/subscribers.json`

```json
{
  "7218322867": { "name": "Admin", "username": "", "type": "private", "joinedAt": "..." },
  "-4123456789": { "name": "Nghỉ hưu sớm", "username": "", "type": "group", "joinedAt": "..." }
}
```

| Export | Mô tả |
|--------|-------|
| `loadSubscribers()` | Đọc từ file |
| `addSubscriber(chatId, info)` | Thêm, trả về `isNew` |
| `removeSubscriber(chatId)` | Xóa, trả về `wasRemoved` |
| `getAllSubscribers()` | Mảng tất cả subscriber |
| `getCount()` | Tổng số |

---

### `telegram/formatter.js` — Message Formatting

| Export | Mô tả |
|--------|-------|
| `formatSignalMessage(result)` | Tín hiệu đơn lẻ (emoji, giá, KL, lý do) |
| `formatScanSummary(results)` | Bảng tóm tắt toàn bộ scan |

---

### `telegram/env_writer.js` — .env Writer

```js
import { setEnvValue } from './env_writer.js';
setEnvValue('MORNING_DEEP_NEWS', 'true');
// → ghi vào .env và cập nhật process.env ngay
```

Dùng cho lệnh `/morning on|off` để lưu setting vĩnh viễn không cần restart.

---

## 8. Scripts tiện ích

### `scripts/pine_pull.js`
Export Pine Script đang mở trong editor → `scripts/current.pine`
```bash
node scripts/pine_pull.js
```

### `scripts/pine_push.js`
Inject Pine Script từ file vào TradingView editor
```bash
node scripts/pine_push.js [file.pine]
```

---

## 9. Tests

| File | Yêu cầu | Bao phủ |
|------|---------|---------|
| `tests/e2e.test.js` | TradingView + CDP | Chart control, data, indicators, drawing |
| `tests/cli.test.js` | Không | CLI parsing, routing, help |
| `tests/pine_analyze.test.js` | Không | Static analysis Pine Script |
| `tests/replay.test.js` | TradingView + CDP | Bar replay mode |
| `tests/sanitization.test.js` | Không | `safeString()`, `requireFinite()` |

Chạy tests:
```bash
npm test          # Tất cả tests
npm run test:e2e  # Chỉ E2E (cần TradingView đang chạy)
```

---

## 10. Tài liệu

| File | Nội dung |
|------|---------|
| `README.md` | Tổng quan, quick start, CLI examples |
| `SETUP_GUIDE.md` | Hướng dẫn cài đặt chi tiết |
| `INTEGRATION_GUIDE_VI.md` | Hướng dẫn tích hợp Telegram (tiếng Việt) |
| `CONTRIBUTING.md` | Quy trình thêm tool/command mới |
| `RESEARCH.md` | Bối cảnh nghiên cứu, failure modes, future work |
| `SECURITY.md` | Mô hình bảo mật, CDP safety, injection prevention |
| `CLAUDE.md` | Context cho Claude Code sessions |
| `docs/SOURCE_INDEX.md` | File này |
| `agents/performance-analyst.md` | Agent spec phân tích performance |

---

## 11. Luồng dữ liệu & kiến trúc

### Kiến trúc tổng thể

```
Claude Code (MCP client)
    ↕  stdio
src/server.js (MCP server)
    ↕
src/tools/*.js  (tool registration + validation)
    ↕
src/core/*.js   (business logic)
    ↕
src/connection.js (CDP client)
    ↕  HTTP/WebSocket :9222
TradingView Desktop (Electron/Chromium)
```

**Telegram Bot (riêng biệt):**
```
Telegram API
    ↕  polling
telegram/bot.js
    ↕
telegram/scanner.js → src/core/* → CDP → TradingView
telegram/news/scheduler.js → fetch → Anthropic API → Telegram
```

### Design Patterns chính

**Dependency Injection:** Core functions nhận `_deps` để dễ test.

**Sanitization:** Mọi input đều qua `safeString()` hoặc `requireFinite()` trước khi inject vào JS context.

**Graceful degradation:** Fallback sang DOM khi API nội bộ không khả dụng.

**JSONL Streaming:** Stream data ra stdout dạng newline-delimited JSON, dedup khi không thay đổi.

### Ước tính kích thước response

| Tool | Output |
|------|--------|
| `quote_get` | ~200 bytes |
| `data_get_study_values` | ~500 bytes |
| `data_get_pine_lines` | ~1–3 KB |
| `data_get_pine_labels` | ~2–5 KB |
| `data_get_ohlcv` (summary) | ~500 bytes |
| `data_get_ohlcv` (100 bars) | ~8 KB |
| `capture_screenshot` | ~300 bytes (path, không phải ảnh) |

> `pine_get_source` trên script phức tạp có thể trả về 200 KB+ — tránh gọi không cần thiết.
