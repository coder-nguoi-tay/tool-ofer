import { moduleState } from './state/module-state.mjs';
import { refreshToffersOverview } from './refresh-toffers-overview.mjs';

/**
 * Bắt đầu cập nhật tổng quan Toffers theo chu kỳ.
 * @param {number} intervalMs Chu kỳ cập nhật theo mili giây.
 * @return {void} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function startToffersBackgroundPolling(intervalMs = 10_000) {
  if (moduleState.toffersAutoRefreshTimer) clearInterval(moduleState.toffersAutoRefreshTimer);
  // Thực hiện gọi lần đầu
  void refreshToffersOverview();
  moduleState.toffersAutoRefreshTimer = setInterval(() => {
    void refreshToffersOverview();
  }, intervalMs);
  console.log(`[Toffers] Đã kích hoạt tiến trình tự động gọi API lấy lead & point chu kỳ mỗi ${intervalMs / 1000}s.`);
}
export { startToffersBackgroundPolling };
