/**
 * Kiểm tra ghi chi tiết có đang được bật có thời hạn cho chính phiên này không.
 * @param {object} session Phiên sở hữu recorder.
 * @return {boolean} True trong khoảng debug do người dùng bật.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function isDetailedRecording(session) {
  return Date.now() < (session.recorderDebugUntil ?? 0);
}

/**
 * Nhận diện lỗi/đứng cần giữ bằng chứng; tài nguyên bị Data Saver chặn không phải lỗi form.
 * @param {object} entry Sự kiện đã chuẩn hóa.
 * @return {boolean} True nếu là dấu hiệu cần chẩn đoán.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function isDiagnosticEvent(entry) {
  return !entry.blockedAtClient && /error|failed|timeout|stalled|stuck|crashed|unverified|invalid|session_idle|unresponsive|traffic_blocked/.test(entry.type || '');
}

/**
 * Chỉ chụp mốc nghiệp vụ hoặc lỗi mới, không chụp theo input/scroll/click thông thường.
 * @param {object} entry Sự kiện tiến trình.
 * @return {boolean} True nếu cần ảnh/HTML sau mốc này.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function shouldCaptureEvent(entry) {
  if (isDiagnosticEvent(entry)) return true;
  if (entry.type === 'navigate') return entry.mainFrame === true;
  if (entry.type === 'browser_action') return ['submit', 'form_state', 'navigate'].includes(entry.kind);
  return /^(tab_opened|screen_advanced|lead_confirmed|submit_clicked|form_submitted|page_loaded)$/.test(entry.type || '');
}
