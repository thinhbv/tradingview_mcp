/**
 * Quản lý danh sách người đăng ký nhận tín hiệu
 * Lưu vào file JSON để không mất dữ liệu khi restart bot
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir  = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dir, 'subscribers.json');

// Cấu trúc: Map<chatId, { name, username, joinedAt }>
let subscribers = new Map();

// ─── Load từ file khi khởi động ──────────────────────────────────────────────

export function loadSubscribers() {
  if (!existsSync(DB_FILE)) return;
  try {
    const raw  = readFileSync(DB_FILE, 'utf-8');
    const data = JSON.parse(raw);
    subscribers = new Map(Object.entries(data).map(([id, info]) => [Number(id), info]));
    console.log(`[Subscribers] ✅ Đã tải ${subscribers.size} người đăng ký`);
  } catch {
    console.warn('[Subscribers] ⚠️ Không đọc được file subscribers.json — bắt đầu mới');
  }
}

// ─── Lưu xuống file ───────────────────────────────────────────────────────────

function save() {
  const obj = {};
  subscribers.forEach((info, chatId) => { obj[chatId] = info; });
  writeFileSync(DB_FILE, JSON.stringify(obj, null, 2), 'utf-8');
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export function addSubscriber(chatId, userInfo = {}) {
  if (subscribers.has(chatId)) return false; // đã có rồi
  subscribers.set(chatId, {
    name:     userInfo.name     || 'Unknown',
    username: userInfo.username || '',
    joinedAt: new Date().toISOString(),
  });
  save();
  return true; // mới thêm
}

export function removeSubscriber(chatId) {
  const existed = subscribers.has(chatId);
  subscribers.delete(chatId);
  if (existed) save();
  return existed;
}

export function isSubscribed(chatId) {
  return subscribers.has(chatId);
}

export function getAllSubscribers() {
  return Array.from(subscribers.entries()).map(([chatId, info]) => ({ chatId, ...info }));
}

export function getCount() {
  return subscribers.size;
}
