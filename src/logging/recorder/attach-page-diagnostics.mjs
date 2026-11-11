import { attachNetworkDiagnostics } from './attach-network-diagnostics.mjs';
import { isDetailedRecording } from './recording-policy.mjs';

/**
 * Ghi bằng chứng lỗi JavaScript, console và request cho đúng tab, không thu header/body mạng.
 * @param {object} page Tab Playwright cần theo dõi.
 * @param {function} addLog Hàm ghi nhật ký thống nhất của phiên.
 * @param {object} [session={}] Phiên để kiểm tra chế độ debug có thời hạn.
 * @return {void} Đăng ký các listener chẩn đoán.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function attachPageDiagnostics(page, addLog, session = {}) {
  /**
   * Chuyển lỗi vào bộ gộp chung của logger để chỉ lỗi mới kích hoạt ảnh/HTML.
   * @param {object} entry Lỗi đã chuẩn hóa từ trình duyệt.
   * @return {void} Ghi lỗi mới hoặc tăng bộ đếm lỗi lặp.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-11
   */
  function recordFailure(entry) {
    addLog({ source: 'browser', ...entry }, page);
  }
  page.on('pageerror', error => recordFailure({ type: 'page_error', detail: error.message.slice(0, 1500), stack: error.stack?.slice(0, 4000) }));
  page.on('console', message => {
    if (!['warning', 'error'].includes(message.type())) return;
    const detail = message.text().slice(0, 1500);
    if (!isDetailedRecording(session) && (message.type() === 'warning' || /ERR_BLOCKED_BY_CLIENT|^Failed to load resource/i.test(detail))) return;
    recordFailure({ type: 'console_error', level: message.type(), detail, location: message.location() });
  });
  attachNetworkDiagnostics(page, addLog, recordFailure, session);
  page.on('crash', () => addLog({ type: 'page_crashed', source: 'browser', detail: 'Tab trình duyệt bị crash.' }, page));
}
