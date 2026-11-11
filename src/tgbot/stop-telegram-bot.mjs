import { moduleState } from './state/module-state.mjs';

/**
 * Dừng bot Telegram hiện tại (nếu đang chạy): tăng generation để vòng poll cũ
 * thoát và clear timer thông báo.
 *
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function stopTelegramBot() {
  moduleState.botGeneration += 1;
  if (moduleState.notifyTimer) {
    clearInterval(moduleState.notifyTimer);
    moduleState.notifyTimer = null;
  }
  moduleState.cfg = null;
}
export { stopTelegramBot };
