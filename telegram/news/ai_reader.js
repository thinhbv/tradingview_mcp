/**
 * AI Reader — Phân tích nội dung trang tin tức bằng AI
 *
 * Tự động chọn phương án:
 *   Phương án A (Vision API): ANTHROPIC_API_KEY có trong .env
 *     → Chụp màn hình → gửi Claude Haiku API (hỗ trợ ảnh, chính xác nhất)
 *
 *   Phương án B (claude -p subprocess): Không có API key
 *     → Lấy text từ trang → pipe vào `claude -p` CLI (tái dùng Claude Code)
 *
 * Cả 2 đều trả về cùng format: danh sách tin tóm tắt
 */

import { execSync }          from 'child_process';
import Anthropic             from '@anthropic-ai/sdk';

// ─── Prompt chung cho cả 2 phương án ─────────────────────────────────────────

const SYSTEM_PROMPT = `Bạn là trợ lý phân tích tin tức chứng khoán Việt Nam.
Nhiệm vụ: đọc nội dung được cung cấp và tóm tắt các tin quan trọng nhất.

Quy tắc:
- Chỉ lấy tin liên quan: cổ phiếu, VN-Index, doanh nghiệp, nhà đầu tư, cổ tức, M&A
- Bỏ qua: quảng cáo, menu điều hướng, nội dung không liên quan
- Mỗi tin: tiêu đề ngắn gọn + tóm tắt 1-2 câu dễ hiểu
- Lấy tối đa 8 tin quan trọng nhất
- Viết bằng tiếng Việt, ngắn gọn, dễ hiểu cho nhà đầu tư cá nhân

Format bắt buộc (giữ đúng):
• [Tiêu đề]: [Tóm tắt 1-2 câu]
• [Tiêu đề]: [Tóm tắt 1-2 câu]`;

const USER_PROMPT_IMAGE = `Đây là ảnh chụp màn hình trang tin tức chứng khoán.
Hãy đọc và tóm tắt theo format đã được hướng dẫn.`;

// ─── Phương án A: Vision API ──────────────────────────────────────────────────

/**
 * Đọc tin từ screenshot bằng Anthropic Vision API
 * @param {string} imageBase64 - Base64 JPEG
 * @param {string} sourceName
 * @returns {Promise<string>}
 */
export async function readByVisionAPI(imageBase64, sourceName = '') {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  console.log(`[AI-A] 🖼️  Vision API đang đọc: ${sourceName}`);

  const response = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    system:     SYSTEM_PROMPT,
    messages: [{
      role:    'user',
      content: [
        {
          type:   'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 },
        },
        { type: 'text', text: USER_PROMPT_IMAGE },
      ],
    }],
  });

  const text = response.content[0]?.text?.trim() || '';
  console.log(`[AI-A] ✅ Vision xong — ${text.split('•').length - 1} tin`);
  return text;
}

// ─── Phương án B: claude -p subprocess ───────────────────────────────────────

/**
 * Đọc tin từ page text bằng `claude -p` CLI subprocess
 * @param {string} pageText   - Nội dung text đã extract từ trang
 * @param {string} sourceName
 * @returns {Promise<string>}
 */
export async function readByClaudeCLI(pageText, sourceName = '') {
  console.log(`[AI-B] 🖥️  claude -p subprocess đang đọc: ${sourceName}`);

  const userMessage = `Đây là nội dung text từ trang tin tức "${sourceName}".
Hãy tóm tắt các tin tức chứng khoán quan trọng nhất theo format đã hướng dẫn.

--- NỘI DUNG TRANG ---
${pageText.substring(0, 8000)}
--- HẾT ---`;

  // Kết hợp system + user thành 1 prompt cho CLI
  const fullPrompt = `${SYSTEM_PROMPT}\n\n${userMessage}`;

  // Dùng path đã tìm được, fallback về 'claude'
  const claudeExe = process.env._CLAUDE_PATH || 'claude';
  const result = execSync(`"${claudeExe}" -p --output-format text`, {
    input:    fullPrompt,
    encoding: 'utf-8',
    timeout:  90000,       // 90 giây timeout
    maxBuffer: 1024 * 512, // 512KB buffer
  }).trim();

  console.log(`[AI-B] ✅ CLI xong — ${result.split('•').length - 1} tin`);
  return result;
}

// ─── Auto-selector: chọn phương án phù hợp ───────────────────────────────────

/**
 * Phát hiện phương án tốt nhất đang có sẵn
 */
export function detectMethod() {
  if (process.env.ANTHROPIC_API_KEY &&
      process.env.ANTHROPIC_API_KEY !== 'your_api_key_here') {
    return 'vision-api';
  }

  // Kiểm tra claude CLI — thử nhiều đường dẫn trên Windows
  const claudePaths = [
    'claude',                                                              // trong PATH
    `${process.env.APPDATA}\\npm\\claude.cmd`,                            // npm global Windows
    `${process.env.APPDATA}\\npm\\claude`,
    `${process.env.LOCALAPPDATA}\\AnthropicClaude\\claude.exe`,           // Claude desktop
    'C:\\nvm4w\\nodejs\\claude.cmd',
    `${process.env.USERPROFILE}\\.claude\\local\\claude`,                 // claude code local
  ];

  for (const claudePath of claudePaths) {
    try {
      execSync(`"${claudePath}" --version`, { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' });
      // Lưu lại path để dùng sau
      process.env._CLAUDE_PATH = claudePath;
      return 'claude-cli';
    } catch {}
  }
  return null;
}

/**
 * Log phương án đang dùng khi khởi động
 */
export function logMethod() {
  const method = detectMethod();
  if (method === 'vision-api') {
    console.log('[AI] ✅ Phương án A: Vision API (ANTHROPIC_API_KEY)');
  } else if (method === 'claude-cli') {
    console.log('[AI] ✅ Phương án B: claude -p subprocess (Claude Code)');
  } else {
    console.warn('[AI] ⚠️  Không tìm thấy phương án AI nào! Cần ANTHROPIC_API_KEY hoặc claude CLI.');
  }
  return method;
}
