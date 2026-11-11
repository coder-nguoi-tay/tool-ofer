import { moduleState } from './state/module-state.mjs';
import { startTelegramBot } from './start-telegram-bot.mjs';
import { stopTelegramBot } from './stop-telegram-bot.mjs';

/**
 * Đọc lại telegram-config.json và khởi động bot với cấu hình mới.
 * Dùng khi người dùng lưu Bot Token / Chat ID từ giao diện web.
 *
 * @return {Promise<{running: boolean, error?: string}>} Trạng thái sau khi reload.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function reloadTelegramBot() {
  stopTelegramBot();
  moduleState.lastUpdateId = 0;
  const started = await startTelegramBot();
  return {
    running: Boolean(started)
  };
}
export { reloadTelegramBot };
