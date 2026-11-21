import { isDiagnosticEvent } from './recording-policy.mjs';

/**
 * Giữ tối đa 100 mốc chẩn đoán, gồm cả lý do bỏ qua autofill, khi dọn ảnh/HTML.
 * @param {object} session Phiên đã đóng, không thuộc nhóm đang chạy/có feedback.
 * @param {number} now Mốc dọn bằng chứng.
 * @return {object} Bản tóm tắt giữ id/sequence, không còn tham chiếu đến artifact bị xóa.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13 (cập nhật 2026-11-20)
 */
export function summarizeRecordingSession(session, now) {
  const important = (session.logs || []).map((entry, index) => ({ ...entry, id: entry.id || `legacy-${index}`, sequence: entry.sequence ?? index + 1 })).filter(entry => entry.snapshotError || isDiagnosticEvent(entry) || /^(ai_|autofill_|offer_manual$|offer_skipped$|select_|record_pool_empty|gologin_|window_visibility_error|browser_close_all_requested|lead_|.*closed|.*completed|submit_|form_submitted|duplicate_tab_)/.test(entry.type || ''));
  const retained = important.length > 100 ? [...important.slice(0, 10), ...important.slice(-90)] : important;
  const fields = ['id', 'sequence', 'time', 'type', 'source', 'tabId', 'screen', 'leadStatus', 'phase', 'ipVerified', 'reasonCode', 'errorName', 'expectedExitIp', 'actualExitIp', 'ip', 'confirmedLeadIp', 'closeReasonType', 'closingDueToNoLead', 'closingDueToTrafficBlocked', 'suppressAutoRefill', 'reason', 'repeatCount', 'snapshotError', 'autofillStep', 'profileOs', 'orbitaVersion', 'platform', 'userAgent', 'uaPlatform', 'uaPlatformVersion', 'uaMobile', 'touchPoints'];
  const logs = retained.map(entry => ({ ...Object.fromEntries(fields.filter(key => entry[key] !== undefined).map(key => [key, entry[key]])), detail: String(entry.detail || '').slice(0, 600) }));
  return { ...session, logs, summaryOnly: true, evidencePrunedAt: new Date(now).toISOString(), omittedEventCount: (session.omittedEventCount || 0) + (session.logs?.length || 0) - logs.length };
}
