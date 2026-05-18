/**
 * PM2 Ecosystem Config
 * Chạy: pm2 start ecosystem.config.cjs
 */
require('dotenv').config();   // ← load .env một lần duy nhất khi PM2 đọc file này

module.exports = {
  apps: [{
    name:         'tv-signal-bot',
    script:       'telegram/index.js',
    cwd:          'D:\\VHEC\\Projects\\2026\\tradingview-mcp',
    interpreter:  'node',

    // Đợi 5 giây trước khi restart để Telegram clear polling session cũ
    restart_delay: 5000,

    // Số lần restart tối đa trong 1 giờ (tránh restart loop)
    max_restarts:  10,
    min_uptime:    '10s',

    // Đảm bảo PATH có đủ npm global và nvm
    env: {
      NODE_ENV: 'production',
      PATH: [
        'C:\\nvm4w\\nodejs',
        'C:\\Users\\VHEC-DEV\\AppData\\Roaming\\npm',  // npm global binaries (claude CLI)
        'C:\\Users\\VHEC-DEV\\AppData\\Local\\nvm',
        process.env.PATH || '',
      ].join(';'),
    },

    // Log files
    out_file:  'logs/bot-out.log',
    error_file: 'logs/bot-error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
  }],
};
