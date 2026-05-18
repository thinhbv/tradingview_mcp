# Deep News — Tin Chuyên Sâu Theo Mã

**Date:** 2026-05-17  
**Status:** Approved

## Tổng quan

Thêm tính năng **Tin Chuyên Sâu** cho Telegram bot: với mỗi mã trong watchlist, scrape nội dung đầy đủ từ các trang tin chứng khoán uy tín rồi dùng ChatGPT (gpt-4o-mini) phân tích và tóm tắt. Đồng thời cập nhật bản tin sáng hiện tại để bao gồm link nguồn.

---

## Phạm vi thay đổi

### 1. Tính năng mới: Deep News

**Trigger:**
- Tự động: cron 9:15 sáng T2–T6 (sau bản tin sáng cơ bản lúc 9:00)
- Thủ công: lệnh Telegram `/deepnews` (toàn bộ watchlist) hoặc `/deepnews VNM` (1 mã)

**Flow:**
```
Lấy watchlist từ bot
  └─ với mỗi symbol:
       1. searcher.js  → tìm 3–5 URL bài viết gần nhất theo mã
       2. fetcher.js   → fetch HTML + extract nội dung (≤3000 từ/bài)
       3. analyzer.js  → gọi OpenAI gpt-4o-mini phân tích toàn bộ nội dung
       4. formatter.js → format tin nhắn Telegram với link nguồn
       5. Gửi, delay 1s, chuyển mã tiếp theo
```

**Nguồn scrape (4 nguồn ưu tiên):**
| Nguồn | URL pattern tìm kiếm theo mã |
|-------|------------------------------|
| Vietstock | `https://vietstock.vn/[symbol]/tin-tuc.htm` |
| FireAnt | `https://fireant.vn/[symbol]` (tab tin tức) |
| CafeF | `https://cafef.vn/search/?q=[symbol]` |
| VnEconomy | `https://vneconomy.vn/search.htm?query=[symbol]` |

**Telegram message format (mỗi mã):**
```
📊 *VNM — Tin Chuyên Sâu*
━━━━━━━━━━━━━━━━━━━
📰 _Phân tích từ 4 nguồn (5 bài) | 17/05/2026_

[Nội dung ChatGPT phân tích — 3–5 điểm bullet]

🔗 Nguồn:
• [Tiêu đề bài 1](url1) — Vietstock
• [Tiêu đề bài 2](url2) — FireAnt
• [Tiêu đề bài 3](url3) — CafeF
⏰ 09:15
```

**Chi phí ước tính:**
- gpt-4o-mini: ~$0.002/mã (5 bài × 3000 từ ≈ 15K tokens)
- 10 mã: ~$0.02/lần → ~$0.40/tháng

---

### 2. Cập nhật bản tin sáng hiện tại (basic news)

Bản tin hiện tại (`telegram/news/scheduler.js`) chỉ gửi tiêu đề + tóm tắt Claude, **không có link**.

**Thay đổi:** Bổ sung link bài viết vào `parseCafeF()` và `parseVnExpress()` — lưu kèm `url` trong object bài viết, format message thêm dòng `🔗 [Đọc thêm](url)` sau mỗi tin.

---

## Files cần tạo / sửa

### Tạo mới
```
telegram/deep_news/
  searcher.js    — tìm URL bài viết theo mã từ 4 nguồn
  fetcher.js     — fetch HTML + extract nội dung bài (cheerio)
  analyzer.js    — gọi OpenAI API (gpt-4o-mini)
  formatter.js   — format Telegram message với link nguồn
  scheduler.js   — cron 9:15 + export sendDeepNewsDigest(symbols, sendToAll)
```

### Sửa hiện có
| File | Thay đổi |
|------|----------|
| `telegram/news/scheduler.js` | `parseCafeF()` + `parseVnExpress()` trả về `{title, url}` thay vì chỉ title; `summarizeWithClaude()` nhận thêm array urls; message thêm link |
| `telegram/bot.js` | Thêm handler `/deepnews [MÃ?]`; import `sendDeepNewsDigest` |
| `telegram/index.js` | Import + start deep news scheduler |
| `.env.example` | Thêm `OPENAI_API_KEY=` |
| `package.json` | Thêm dependency `openai` |

---

## Error handling

- Nếu 1 nguồn scrape thất bại → bỏ qua, dùng các nguồn còn lại
- Nếu 1 mã không có bài nào → gửi `⚠️ VNM: Không tìm thấy tin hôm nay`
- Nếu OpenAI API lỗi → gửi thông báo lỗi, không crash toàn bộ digest
- Timeout fetch: 10s/trang (như scraper hiện tại)

---

## Out of scope

- Lưu trữ lịch sử tin vào DB
- Dedup bài giữa các nguồn (chấp nhận trùng lặp ở mức độ nhỏ)
- Scraping toàn bộ 10 nguồn (chỉ 4 nguồn ưu tiên có URL search theo mã rõ ràng)
