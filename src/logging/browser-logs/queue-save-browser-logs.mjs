import { moduleState } from './state/module-state.mjs';
import { savePersistedBrowserLogs } from './save-persisted-browser-logs.mjs';
import { maintainRecordingRetention } from './maintain-recording-retention.mjs';

/**
 * Gộp lưu tiến trình trong 5 giây; mốc lỗi/kết thúc được caller yêu cầu lưu sớm hơn.
 * @param {number} [delayMs=5000] Khoảng chờ tối đa, không lùi lịch đang chờ sớm hơn.
 * @return {void} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
function queueSaveBrowserLogs(delayMs = 5000) {
  const dueAt = Date.now() + delayMs;
  if (moduleState.saveBrowserLogsTimer && moduleState.saveBrowserLogsDueAt <= dueAt) return;
  clearTimeout(moduleState.saveBrowserLogsTimer);
  moduleState.saveBrowserLogsDueAt = dueAt;
  moduleState.saveBrowserLogsTimer = setTimeout(() => {
    moduleState.saveBrowserLogsTimer = null;
    void savePersistedBrowserLogs().then(() => maintainRecordingRetention());
  }, delayMs);
  moduleState.saveBrowserLogsTimer.unref?.();
}
export { queueSaveBrowserLogs };
