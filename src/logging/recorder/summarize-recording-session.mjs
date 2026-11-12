import { isDiagnosticEvent } from './recording-policy.mjs';

/**
 * Giữ tối đa 100 mốc lỗi, AI, lead và đóng phiên khi ảnh/HTML của phiên đã được dọn.
 * @param {object} session Phiên đã đóng, không thuộc nhóm đang chạy/có feedback.
 * @param {number} now Mốc dọn bằng chứng.
 * @return {object} Bản tóm tắt giữ id/sequence, không còn tham chiếu đến artifact bị xóa.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function summarizeRecordingSession(session, now) {
  const important = (session.logs || []).map((entry, index) => ({ ...entry, id: entry.id || `legacy-${index}`, sequence: entry.sequence ?? index + 1 })).filter(entry => entry.snapshotError || isDiagnosticEvent(entry) || /^(ai_|autofill_|select_|record_pool_empty|lead_|.*closed|.*completed|submit_|form_submitted|duplicate_tab_)/.test(entry.type || ''));
  const retained = important.length > 100 ? [...important.slice(0, 10), ...important.slice(-90)] : important;
  const fields = ['id', 'sequence', 'time', 'type', 'source', 'tabId', 'screen', 'leadStatus', 'reason', 'repeatCount', 'snapshotError', 'autofillStep'];
  const logs = retained.map(entry => ({ ...Object.fromEntries(fields.filter(key => entry[key] !== undefined).map(key => [key, entry[key]])), detail: String(entry.detail || '').slice(0, 600) }));
  return { ...session, logs, summaryOnly: true, evidencePrunedAt: new Date(now).toISOString(), omittedEventCount: (session.omittedEventCount || 0) + (session.logs?.length || 0) - logs.length };
}
