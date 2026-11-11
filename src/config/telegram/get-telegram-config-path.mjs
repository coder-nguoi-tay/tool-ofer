import { appDataDirectory } from '../paths.mjs';
import { join } from 'node:path';

/**
 * Đường dẫn file cấu hình Telegram bot của instance đang chạy.
 *
 * @return {string} Đường dẫn tuyệt đối tới telegram-config.json.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function getTelegramConfigPath() {
  return join(appDataDirectory, 'telegram-config.json');
}
export { getTelegramConfigPath };
