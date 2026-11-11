import { getTelegramConfigPath } from './get-telegram-config-path.mjs';
import { readFile } from 'node:fs/promises';

/**
 * Đọc cấu hình Telegram bot đã lưu (botToken, allowedUserId, notifyChatId).
 *
 * @return {Promise<{botToken: string, allowedUserId: number|null, notifyChatId: number|null}>} Cấu hình đã chuẩn hóa.
 * @throws {Error} Khi file không tồn tại hoặc JSON hỏng (caller tự bắt).
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function loadTelegramConfig() {
  const raw = JSON.parse(await readFile(getTelegramConfigPath(), 'utf8'));
  return {
    botToken: String(raw.botToken || '').trim(),
    allowedUserId: Number(raw.allowedUserId) || null,
    notifyChatId: Number(raw.notifyChatId) || null
  };
}
export { loadTelegramConfig };
