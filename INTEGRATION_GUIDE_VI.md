# Tài liệu tích hợp: Claude Code + TradingView MCP + TradingView Desktop

> **Phiên bản:** 1.0  
> **Ngày:** 2026-05-11  
> **Tác giả:** Tổng hợp từ phiên làm việc thực tế với Claude Code  
> **Môi trường:** Windows 11, TradingView Desktop (Windows Store), Node.js 18+

---

## Mục lục

1. [Tổng quan hệ thống](#1-tổng-quan-hệ-thống)
2. [Yêu cầu & Cài đặt](#2-yêu-cầu--cài-đặt)
3. [Kiến trúc kỹ thuật](#3-kiến-trúc-kỹ-thuật)
4. [Hướng dẫn sử dụng](#4-hướng-dẫn-sử-dụng)
5. [Danh sách Tools (78 tools)](#5-danh-sách-tools)
6. [Ví dụ thực tế](#6-ví-dụ-thực-tế)
7. [Giới hạn & Lưu ý](#7-giới-hạn--lưu-ý)
8. [Mở rộng & Tích hợp nâng cao](#8-mở-rộng--tích-hợp-nâng-cao)

---

## 1. Tổng quan hệ thống

### Hệ thống này là gì?

Tích hợp **Claude Code AI + TradingView MCP** cho phép Claude AI có khả năng:
- Đọc dữ liệu real-time từ TradingView Desktop (giá, OHLCV, indicators)
- Điều khiển chart (đổi symbol, timeframe, thêm/xóa indicator)
- Viết và deploy Pine Script trực tiếp
- Phân tích kỹ thuật tự động theo lệnh ngôn ngữ tự nhiên

### Sơ đồ tổng quan

```
Người dùng (ngôn ngữ tự nhiên)
        ↓
   Claude Code AI
        ↓ gọi tools
 TradingView MCP Server (Node.js)
        ↓ Chrome DevTools Protocol (CDP)
  TradingView Desktop App
        ↓ WebSocket
  TradingView Cloud (dữ liệu thị trường)
```

### Ứng dụng thực tế

| Tình huống | Lệnh ví dụ |
|-----------|-----------|
| Phân tích đa cặp | "Soi BTC, ETH, SOL khung 4H và Daily, cho biết nên vào cặp nào" |
| Scan cổ phiếu VN | "Kiểm tra VIC, VHM, VNM — RSI và EMA, cái nào setup đẹp nhất?" |
| Viết indicator | "Viết Pine Script tính RSI divergence và vẽ tín hiệu lên chart" |
| Cảnh báo giá | "Tạo alert khi BTC về 80,000" |
| Chụp chart | "Chụp chart hiện tại và phân tích price action" |

---

## 2. Yêu cầu & Cài đặt

### 2.1 Yêu cầu hệ thống

| Phần mềm | Phiên bản | Ghi chú |
|---------|----------|--------|
| Windows | 10/11 | macOS/Linux cũng hỗ trợ |
| Node.js | 18+ | Kiểm tra: `node --version` |
| TradingView Desktop | Bất kỳ | Cần tài khoản TV (free hoặc paid) |
| Claude Code | Mới nhất | Cài tại claude.ai/code |
| Git | Bất kỳ | Để clone repo |

### 2.2 Cài đặt từng bước

#### Bước 1: Lấy username Windows
```powershell
echo $env:USERNAME
# Output: VHEC-DEV (ví dụ)
```

#### Bước 2: Clone repository

```powershell
git clone https://github.com/tradesdontlie/tradingview-mcp.git `
  D:\VHEC\Projects\2026\tradingview-mcp
```

#### Bước 3: Cài đặt dependencies

```powershell
cd D:\VHEC\Projects\2026\tradingview-mcp
npm install
# Output: audited 95 packages
```

#### Bước 4: Cấu hình MCP trong Claude Code

Thêm vào file `C:\Users\{USERNAME}\.claude.json` (file config chính của Claude Code):

```json
{
  "mcpServers": {
    "tradingview": {
      "command": "node",
      "args": ["D:\\VHEC\\Projects\\2026\\tradingview-mcp\\src\\server.js"]
    }
  }
}
```

> **Lưu ý:** File này được Claude Code tự quản lý. Nên dùng lệnh `claude mcp add` nếu có CLI, hoặc chỉnh sửa trực tiếp JSON như trên.

**Vị trí thực tế trên máy VHEC-DEV:**
```
C:\Users\VHEC-DEV\.claude.json  ← file config chính
C:\Users\VHEC-DEV\AppData\Roaming\Claude\.mcp.json  ← file tạo thêm (tham khảo)
```

#### Bước 5: Khởi động lại Claude Code

Đóng và mở lại Claude Code để load MCP server mới. Khi thành công, Claude sẽ thấy 78 tools mới với prefix `mcp__tradingview__`.

#### Bước 6: Mở TradingView với Debug Port

**Trường hợp cài từ Windows Store (như máy VHEC-DEV):**

```powershell
# Tìm đường dẫn TradingView (chỉ cần làm 1 lần)
Get-Process -Name "TradingView" | Select-Object Path

# Kết quả:
# C:\Program Files\WindowsApps\TradingView.Desktop_3.1.0.7818_x64__n534cwy3pjxzj\TradingView.exe

# Mở TradingView với debug port (chạy mỗi khi dùng)
& "C:\Program Files\WindowsApps\TradingView.Desktop_3.1.0.7818_x64__n534cwy3pjxzj\TradingView.exe" --remote-debugging-port=9222
```

**Trường hợp cài bản Standalone (khuyến nghị):**
```powershell
& "C:\Users\{USERNAME}\AppData\Local\TradingView\TradingView.exe" --remote-debugging-port=9222
```

> **Tại sao cần `--remote-debugging-port=9222`?**  
> Flag này bật Chrome DevTools Protocol (CDP) — cổng giao tiếp để MCP server có thể đọc/ghi dữ liệu từ TradingView.

#### Bước 7: Kiểm tra kết nối

Trong Claude Code, gọi:
```
tv_health_check
```

Kết quả thành công:
```json
{
  "success": true,
  "cdp_connected": true,
  "chart_symbol": "BATS:AAPL",
  "chart_resolution": "D",
  "api_available": true
}
```

---

## 3. Kiến trúc kỹ thuật

### 3.1 Luồng dữ liệu chi tiết

```
TradingView Cloud
      ↓ wss:// (WebSocket bảo mật)
TradingView Desktop (Electron/Chromium)
      ├── Chart Engine (JS)        ← tính RSI, EMA, MACD
      ├── Data Store (RAM)         ← giá OHLCV real-time
      └── DOM/UI                   ← giao diện người dùng
      ↑↓ localhost:9222 (CDP WebSocket)
MCP Server (Node.js - src/server.js)
      ├── 78 tools định nghĩa      ← src/tools/*.js
      └── Core logic               ← src/core/*.js
      ↑↓ MCP Protocol (stdio)
Claude Code AI
      ↑↓
Người dùng
```

### 3.2 Chrome DevTools Protocol (CDP)

CDP là giao thức chuẩn mở của Google, cho phép tương tác với Chromium/Electron apps:

```bash
# Kiểm tra CDP đang hoạt động
curl http://localhost:9222/json

# Response:
[{
  "id": "8C3CFC1791349048BF22319AC7B2A673",
  "title": "TradingView Charts",
  "url": "https://www.tradingview.com/chart/PQeUqqYt/",
  "webSocketDebuggerUrl": "ws://localhost:9222/devtools/page/8C3CFC17..."
}]
```

### 3.3 Cách MCP đọc dữ liệu indicator

```javascript
// src/core/data.js - Đọc giá trị indicators từ TradingView
export async function getStudyValues() {
  const data = await evaluate(`
    (function() {
      // Truy cập trực tiếp vào Chart Widget của TradingView
      var chart = window.TradingViewApi
                        ._activeChartWidgetWV
                        .value()
                        ._chartWidget;

      // Lấy tất cả data sources (= tất cả indicators trên chart)
      var sources = chart.model().model().dataSources();

      var results = [];
      for (var i = 0; i < sources.length; i++) {
        var s = sources[i];
        if (!s.metaInfo) continue;
        results.push({
          name: s.metaInfo().shortDescription,  // "RSI", "EMA"...
          values: s.data().last()               // 76.78, 218041...
        });
      }
      return results;
    })()
  `);
  return { success: true, studies: data };
}
```

**Quan trọng:** MCP KHÔNG tự tính toán indicators. Nó chỉ **đọc kết quả đã được TradingView tính sẵn** từ RAM của app.

### 3.4 Cấu trúc thư mục project

```
tradingview-mcp/
├── src/
│   ├── server.js          ← Entry point MCP, đăng ký 78 tools
│   ├── tools/             ← Định nghĩa từng nhóm tool
│   │   ├── chart.js       ← chart_set_symbol, chart_set_timeframe...
│   │   ├── data.js        ← data_get_ohlcv, data_get_study_values...
│   │   ├── pine.js        ← pine_set_source, pine_compile...
│   │   ├── draw.js        ← draw_shape, draw_list...
│   │   ├── alert.js       ← alert_create, alert_list...
│   │   └── ui.js          ← ui_click, ui_screenshot...
│   ├── core/              ← Logic thực thi
│   │   ├── cdp.js         ← Kết nối CDP, evaluate JS
│   │   ├── chart.js       ← Điều khiển chart
│   │   ├── data.js        ← Đọc dữ liệu
│   │   └── pine.js        ← Pine Script operations
│   └── cli/               ← CLI interface (lệnh `tv`)
├── screenshots/           ← Ảnh chụp chart (tự động tạo)
├── package.json
└── README.md
```

---

## 4. Hướng dẫn sử dụng

### 4.1 Khởi động hàng ngày

```powershell
# 1. Mở TradingView với debug port
& "C:\Program Files\WindowsApps\TradingView.Desktop_3.1.0.7818_x64__n534cwy3pjxzj\TradingView.exe" --remote-debugging-port=9222

# 2. Mở Claude Code (đã cấu hình MCP)
# 3. Kiểm tra kết nối
# → Nhắn Claude: "tv_health_check"
```

### 4.2 Giới hạn Free Plan TradingView

| Giới hạn | Free | Pro |
|---------|------|-----|
| Indicators/chart | **3** | 5-25 |
| Alerts | 1 | 20-400 |
| Realtime data | ✅ | ✅ |

**Workaround cho Free Plan:** Chỉ dùng 3 indicators (khuyến nghị: Volume + EMA20 + RSI).  
MACD và các indicator khác không thể thêm đồng thời trên Free Plan.

### 4.3 Quy trình phân tích chuẩn

```
1. tv_health_check          ← Kiểm tra kết nối
2. chart_set_symbol         ← Đổi sang mã cần phân tích
3. chart_set_timeframe      ← Chọn khung thời gian
4. quote_get                ← Lấy giá hiện tại
5. data_get_study_values    ← Đọc RSI, EMA, Volume
6. data_get_ohlcv           ← Lấy lịch sử nến (summary=true)
7. Phân tích & kết luận
```

---

## 5. Danh sách Tools

78 tools chia theo nhóm chức năng:

### Nhóm 1: Khởi động & Kiểm tra
| Tool | Mô tả |
|------|-------|
| `tv_launch` | Tự động tìm và mở TradingView với debug port |
| `tv_health_check` | Kiểm tra kết nối CDP và trạng thái chart |
| `tv_discover` | Liệt kê các API paths đang hoạt động |
| `tv_ui_state` | Xem trạng thái UI hiện tại |

### Nhóm 2: Điều khiển Chart
| Tool | Mô tả |
|------|-------|
| `chart_set_symbol` | Đổi mã cổ phiếu/crypto |
| `chart_set_timeframe` | Đổi khung thời gian (1, 5, 15, 60, 240, D, W) |
| `chart_set_type` | Đổi loại chart (nến, line, bar...) |
| `chart_get_state` | Lấy trạng thái hiện tại (symbol, TF, indicators) |
| `chart_get_visible_range` | Lấy vùng thời gian đang hiển thị |
| `chart_set_visible_range` | Thiết lập vùng thời gian hiển thị |
| `chart_scroll_to_date` | Cuộn chart đến ngày cụ thể |
| `chart_manage_indicator` | Thêm/xóa indicator |

### Nhóm 3: Đọc dữ liệu
| Tool | Mô tả |
|------|-------|
| `quote_get` | Giá real-time (OHLCV + last) |
| `data_get_ohlcv` | Lịch sử nến (max 500 bars) |
| `data_get_study_values` | Giá trị indicators (RSI, EMA...) |
| `data_get_equity` | Equity curve từ strategy |
| `data_get_indicator` | Dữ liệu indicator cụ thể |
| `data_get_strategy_results` | Kết quả backtest |
| `data_get_trades` | Danh sách trades từ strategy |
| `data_get_pine_labels` | Labels từ Pine Script |
| `data_get_pine_lines` | Lines từ Pine Script |
| `data_get_pine_tables` | Tables từ Pine Script |
| `data_get_pine_boxes` | Boxes từ Pine Script |
| `symbol_info` | Thông tin symbol (sàn, loại...) |
| `symbol_search` | Tìm kiếm symbol |

### Nhóm 4: Pine Script
| Tool | Mô tả |
|------|-------|
| `pine_set_source` | Inject code Pine Script |
| `pine_get_source` | Lấy code hiện tại |
| `pine_compile` | Compile script |
| `pine_smart_compile` | Compile + tự sửa lỗi |
| `pine_check` | Kiểm tra syntax |
| `pine_analyze` | Phân tích script |
| `pine_get_errors` | Đọc lỗi compile |
| `pine_get_console` | Đọc console output |
| `pine_new` | Tạo script mới |
| `pine_open` | Mở script có sẵn |
| `pine_save` | Lưu script |
| `pine_list_scripts` | Liệt kê scripts đã lưu |

### Nhóm 5: Vẽ trên Chart
| Tool | Mô tả |
|------|-------|
| `draw_shape` | Vẽ đường, hộp, text |
| `draw_list` | Liệt kê drawings |
| `draw_get_properties` | Lấy thuộc tính drawing |
| `draw_remove_one` | Xóa 1 drawing |
| `draw_clear` | Xóa tất cả drawings |

### Nhóm 6: Alerts
| Tool | Mô tả |
|------|-------|
| `alert_create` | Tạo alert mới |
| `alert_list` | Liệt kê alerts |
| `alert_delete` | Xóa alert |

### Nhóm 7: Replay (Luyện tập)
| Tool | Mô tả |
|------|-------|
| `replay_start` | Bắt đầu replay mode |
| `replay_step` | Bước từng nến |
| `replay_trade` | Đặt lệnh trong replay |
| `replay_autoplay` | Tự động phát |
| `replay_status` | Trạng thái hiện tại |
| `replay_stop` | Dừng replay |

### Nhóm 8: Pane & Layout
| Tool | Mô tả |
|------|-------|
| `pane_list` | Liệt kê các pane |
| `pane_focus` | Focus vào pane |
| `pane_set_layout` | Đặt layout (2x2, 3x1...) |
| `pane_set_symbol` | Đặt symbol cho pane cụ thể |
| `layout_list` | Liệt kê layouts đã lưu |
| `layout_switch` | Chuyển layout |

### Nhóm 9: UI Automation
| Tool | Mô tả |
|------|-------|
| `ui_click` | Click element theo aria-label/text |
| `ui_mouse_click` | Click theo tọa độ x,y |
| `ui_find_element` | Tìm element trên UI |
| `ui_type_text` | Gõ text vào input |
| `ui_hover` | Hover chuột |
| `ui_scroll` | Cuộn trang |
| `ui_keyboard` | Nhấn phím |
| `ui_fullscreen` | Bật/tắt fullscreen |
| `ui_open_panel` | Mở panel cụ thể |
| `ui_evaluate` | Chạy JavaScript tùy ý |
| `capture_screenshot` | Chụp ảnh chart |

### Nhóm 10: Tabs
| Tool | Mô tả |
|------|-------|
| `tab_list` | Liệt kê tabs |
| `tab_new` | Mở tab mới |
| `tab_switch` | Chuyển tab |
| `tab_close` | Đóng tab |

### Nhóm 11: Khác
| Tool | Mô tả |
|------|-------|
| `batch_run` | Chạy action trên nhiều symbols |
| `quote_get` | Lấy giá |
| `depth_get` | Order book (bid/ask) |
| `indicator_set_inputs` | Thay đổi input indicator |
| `indicator_toggle_visibility` | Ẩn/hiện indicator |
| `watchlist_get` | Lấy danh sách watchlist |
| `watchlist_add` | Thêm vào watchlist |

---

## 6. Ví dụ thực tế

### Ví dụ 1: Phân tích đa cặp crypto

```
Lệnh: "Soi BTCUSDT, SOLUSDT, ETHUSDT trên khung 4H và Daily,
        đọc RSI, EMA rồi cho biết hôm nay nên vào cặp nào"

Tools được gọi:
1. chart_set_symbol("BINANCE:BTCUSDT")
2. chart_set_timeframe("240")
3. data_get_study_values()  → RSI: 55.01, EMA: 81,181
4. chart_set_timeframe("D")
5. data_get_study_values()  → RSI: 62.93, EMA: 80,424
6. chart_set_symbol("BINANCE:SOLUSDT") → lặp lại...
7. chart_set_symbol("BINANCE:ETHUSDT") → lặp lại...

Kết quả phân tích:
- BTC: RSI Daily 62.9, trên EMA20 → BULLISH (setup đẹp nhất)
- SOL: RSI 68.4-68.7, gần overbought → BULLISH nhưng rủi ro cao
- ETH: RSI 54.3-54.7, neutral → Chưa có tín hiệu rõ
```

### Ví dụ 2: Phân tích cổ phiếu VN

```
Lệnh: "Soi VIC"

Tools:
1. chart_set_symbol("HOSE:VIC")
2. chart_set_timeframe("D")
3. quote_get() → giá 228,300
4. data_get_study_values() → RSI: 76.78, EMA: 218,041
5. chart_set_timeframe("W")
6. data_get_study_values() → RSI: 74.38, EMA: 194,139
7. data_get_ohlcv(count=120) → lịch sử 120 phiên

Kết luận: RSI overbought cả Daily & Weekly
Đề xuất: Chờ pullback về 205,000-218,000
Target nếu phá 231,000: 260,000 → 298,000
```

### Ví dụ 3: Thiết lập rule tự động

Tạo file `CLAUDE.md` trong project directory:

```markdown
# Trading Rules - VHEC

## Lệnh "scan watchlist"
Khi người dùng gõ "scan watchlist", thực hiện:
1. Quét các mã: BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT, XRPUSDT
2. Timeframe: Daily
3. Lọc điều kiện: RSI < 65 VÀ giá > EMA20
4. Xếp hạng theo RSI tăng dần (RSI thấp = cơ hội tốt hơn)
5. Output: bảng markdown với bias Long/Short/Neutral

## Lệnh "check VN30"
Quét top 10 cổ phiếu VN30: VIC, VHM, VNM, VCB, BID, CTG, HPG, GAS, SAB, MSN
```

---

## 7. Giới hạn & Lưu ý

### 7.1 Giới hạn kỹ thuật

| Vấn đề | Nguyên nhân | Giải pháp |
|--------|------------|----------|
| TradingView phải mở | CDP chỉ hoạt động khi app chạy | Tạo script tự động mở |
| Phải có `--remote-debugging-port=9222` | Cổng debug mặc định bị tắt | Tạo shortcut/script |
| Indicator phải visible | MCP đọc từ DOM | Đảm bảo indicator đang hiển thị |
| Free plan: max 3 indicators | Giới hạn TradingView | Nâng cấp Pro hoặc chọn 3 indicators |
| Scan chậm với nhiều mã | Tuần tự, không parallel | Dùng `batch_run` hoặc giới hạn < 30 mã |
| TV update có thể break | Dùng API nội bộ không chính thức | Theo dõi repo để update |

### 7.2 Lưu ý bảo mật

```
⚠️  Port 9222 CHỈ expose localhost
⚠️  Không mở port này ra internet
⚠️  Không share màn hình khi debug port đang mở
⚠️  MCP không lưu/truyền dữ liệu ra ngoài
```

### 7.3 Disclaimer

> Tool này **không phải sản phẩm chính thức của TradingView**. Sử dụng thông qua CDP là kỹ thuật được chấp nhận trong phát triển phần mềm nhưng nằm trong **vùng xám** của Terms of Service TradingView.  
> Mọi phân tích từ AI chỉ mang tính **tham khảo**, không phải khuyến nghị đầu tư.

---

## 8. Mở rộng & Tích hợp nâng cao

### 8.1 Tích hợp Zalo Notifications

```
Kiến trúc đơn giản (chỉ gửi cảnh báo 1 chiều):

Máy tính (chạy script tự động mỗi 4H)
    ↓ Node.js script
MCP → TradingView → lấy data
    ↓
Zalo API (gửi tin nhắn cá nhân)
    ↓
Điện thoại nhận cảnh báo

Build time: 1-2 ngày
```

### 8.2 Tích hợp Web Dashboard

```
Web App (React/Vue)
├── TradingView Lightweight Charts  ← biểu đồ
├── Chat AI (Claude API)            ← phân tích
└── REST API backend
        ↓
   MCP Server
        ↓
   TradingView Desktop (máy chủ)

Build time: 1-2 tuần
```

### 8.3 Nhúng biểu đồ TradingView vào Web

**Cách 1 - Widget (đơn giản nhất):**
```html
<iframe
  src="https://www.tradingview.com/widgetembed/?symbol=HOSE%3AMIC&interval=D"
  width="100%" height="500" frameborder="0">
</iframe>
```

**Cách 2 - Lightweight Charts (mã nguồn mở):**
```bash
npm install lightweight-charts
```

**Cách 3 - Advanced Charts (đầy đủ tính năng):**
Đăng ký tại: tradingview.com/HTML5-stock-forex-bitcoin-charting-library

### 8.4 Lệnh khởi động nhanh (PowerShell Script)

Tạo file `start-trading.ps1`:

```powershell
# start-trading.ps1
Write-Host "Starting TradingView with debug port..." -ForegroundColor Green

$tvPath = "C:\Program Files\WindowsApps\TradingView.Desktop_3.1.0.7818_x64__n534cwy3pjxzj\TradingView.exe"

if (Test-Path $tvPath) {
    & $tvPath --remote-debugging-port=9222
    Write-Host "TradingView started! Debug port: 9222" -ForegroundColor Cyan
    Write-Host "Open Claude Code and run: tv_health_check" -ForegroundColor Yellow
} else {
    Write-Host "TradingView not found at: $tvPath" -ForegroundColor Red
    Write-Host "Please find the correct path first." -ForegroundColor Red
}
```

Chạy:
```powershell
.\start-trading.ps1
```

---

## Tổng kết

| Bước | Công việc | Trạng thái |
|------|----------|-----------|
| 1 | Tìm username (`VHEC-DEV`) | ✅ |
| 2 | Clone repo về `D:\VHEC\Projects\2026\tradingview-mcp` | ✅ |
| 3 | `npm install` (95 packages) | ✅ |
| 4 | Cấu hình MCP trong `~/.claude.json` | ✅ |
| 5 | Restart Claude Code | ✅ |
| 6 | Mở TradingView với `--remote-debugging-port=9222` | ✅ |
| 7 | `tv_health_check` → Connected! | ✅ |
| 8 | Phân tích BTC, SOL, ETH, VIC | ✅ |

**78 tools sẵn sàng sử dụng tại:** `D:\VHEC\Projects\2026\tradingview-mcp`

---

*Tài liệu này được tạo tự động từ phiên làm việc thực tế với Claude Code ngày 2026-05-11.*  
*Repo gốc: https://github.com/tradesdontlie/tradingview-mcp*
