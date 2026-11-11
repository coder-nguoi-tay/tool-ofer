import { appDataDirectory } from '../paths.mjs';
import { getTelegramConfigPath } from './get-telegram-config-path.mjs';
import { mkdir } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';

/**
 * Ghi cấu hình Telegram bot xuống đĩa với quyền 0600 (chỉ user sở hữu đọc được).
 *
 * @param {{botToken: string, allowedUserId: number, notifyChatId?: number|null}} config Cấu hình cần lưu.
 * @return {Promise<void>} Hoàn tất khi file đã ghi xong.
 * @throws {Error} Khi không ghi được file.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function saveTelegramConfig(config) {
  await mkdir(appDataDirectory, {
    recursive: true,
    mode: 0o700
  });
  const payload = {
    botToken: String(config.botToken || '').trim(),
    allowedUserId: Number(config.allowedUserId),
    notifyChatId: config.notifyChatId ? Number(config.notifyChatId) : Number(config.allowedUserId)
  };
  await writeFile(getTelegramConfigPath(), JSON.stringify(payload, null, 2), {
    mode: 0o600
  });
}
export { saveTelegramConfig };
