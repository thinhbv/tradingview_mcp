/**
 * Cấu hình Telegram Signal Bot
 * Chỉnh sửa watchlist, interval, và thông số signal tại đây
 */
export const config = {
  telegram: {
    // Lấy từ @BotFather trên Telegram
    token: process.env.TELEGRAM_TOKEN || '',
    // Chat ID của bạn (xem hướng dẫn setup)
    chatId: process.env.TELEGRAM_CHAT_ID || '',
  },

  scanner: {
    intervalMs: 30 * 60 * 1000, // Scan mỗi 30 phút

    // Giờ giao dịch HOSE (múi giờ VN)
    marketOpenHour: 9,
    marketOpenMinute: 15,
    marketCloseHour: 14,
    marketCloseMinute: 45,

    // Thời gian chờ giữa các mã (ms) — cần để chart load xong
    delayBetweenSymbols: 4000,

    // Danh sách mã theo dõi mặc định
    watchlist: [
      'HOSE:FPT',
      'HOSE:VCB',
      'HOSE:TCB',
      'HOSE:HPG',
      'HOSE:MWG',
      'HOSE:SHB',
      'HOSE:VHM',
      'HOSE:MBB',
    ],
  },

  morning: {
    // Bản tin sáng tự động (9:00 T2-T6) — đọc từ .env, có thể thay đổi runtime
    get basicNews() { return process.env.MORNING_BASIC_NEWS !== 'false'; },
    get deepNews()  { return process.env.MORNING_DEEP_NEWS  === 'true';  },
    get vnindex()   { return process.env.MORNING_VNINDEX    === 'true';  },
  },

  signals: {
    // Giá trong vùng <= X% trên đáy 60 phiên → tín hiệu MUA
    oversoldPct: 0.20,
    // Giá trong vùng <= X% dưới đỉnh 60 phiên → tín hiệu BÁN
    overboughtPct: 0.08,
    // KL hôm nay > X lần KL trung bình → đáng chú ý
    volumeMultiplier: 1.3,
    // Chỉ gửi thông báo khi signal score >= minScore
    minScore: 2,
  },
};
