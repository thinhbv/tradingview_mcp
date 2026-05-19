/**
 * Ghi/cập nhật giá trị biến trong file .env (không làm mất các biến khác)
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const ENV_PATH = resolve(process.cwd(), '.env');

export function setEnvValue(key, value) {
  let content;
  try {
    content = readFileSync(ENV_PATH, 'utf8');
  } catch {
    content = '';
  }

  const line    = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');

  if (pattern.test(content)) {
    content = content.replace(pattern, line);
  } else {
    content = content.trimEnd() + `\n${line}\n`;
  }

  writeFileSync(ENV_PATH, content, 'utf8');
  // Cập nhật luôn process.env để có hiệu lực ngay không cần restart
  process.env[key] = String(value);
}
