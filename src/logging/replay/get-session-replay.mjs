import { persistedBrowserLogs } from '../browser-logs/state/persisted-browser-logs.mjs';

/**
 * Chuẩn hóa phiên mới hoặc lịch sử cũ thành dữ liệu xem lại và ghi chú huấn luyện.
 * @param {string} sessionId Định danh phiên trong lịch sử trình duyệt.
 * @return {object|null} Phiên có sự kiện được gán id ổn định, hoặc null nếu không tìm thấy.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function getSessionReplay(sessionId) {
  const session = persistedBrowserLogs.find(item => item.id === sessionId);
  if (!session) return null;
  const { logs = [], ...metadata } = session;
  return {
    schemaVersion: 1, recordingMode: 'progress_with_error_context_and_checkpoints',
    session: metadata,
    events: logs.map((entry, index) => ({ ...entry, id: entry.id || `legacy-${index}`, sequence: entry.sequence || index + 1 })),
    diagnosticEventTypes: ['page_error', 'console_error', 'request_failed', 'http_error', 'page_crashed', 'recorder_error', 'autofill_library_stalled', 'autofill_stuck', 'autofill_renderer_unresponsive', 'offer_session_idle', 'submit_rejected_with_error', 'ai_error', 'traffic_blocked', 'lead_failed'],
  };
}
