import { get711Balance } from './get711-balance.mjs';
import { moduleState } from './state/module-state.mjs';
import { proxy711 } from './state/proxy711.mjs';

/**
 * Bắt đầu cập nhật số dư 711Proxy theo chu kỳ.
 * @param {number} intervalMs Chu kỳ cập nhật theo mili giây.
 * @return {void} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function start711BalanceBackgroundPolling(intervalMs = 30_000) {
  if (moduleState.proxy711BalanceTimer) clearInterval(moduleState.proxy711BalanceTimer);
  if (proxy711.username && proxy711.passwd) {
    void get711Balance(false);
  }
  moduleState.proxy711BalanceTimer = setInterval(() => {
    if (proxy711.username && proxy711.passwd) {
      void get711Balance(false);
    }
  }, intervalMs);
}
export { start711BalanceBackgroundPolling };
