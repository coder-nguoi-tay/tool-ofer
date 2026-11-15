import { leadIpStatsMap, normalizeIpAddress } from '../../../lead-check.mjs';

/**
 * Giữ cờ có lead theo IP của phiên trình duyệt, độc lập với trạng thái DOM sau tải lại trang.
 * Khôi phục từ lịch sử IP có lead và chỉ áp dụng cho đúng IP đã được xác nhận.
 * Lịch sử chỉ được tin khi lead được ghi SAU khi phiên này bắt đầu: lead-stats.json giữ IP có lead của mọi lượt chạy
 * trước (mọi offer, nhiều tuần), proxy xoay vòng cấp lại đúng IP cũ thì phiên mới không được thừa hưởng lead đó.
 * @param {object} session Phiên trình duyệt cần bảo vệ khỏi các nhánh tự đóng.
 * @return {boolean} True khi IP đã có lead và phiên phải được giữ mở.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function protectConfirmedLeadSession(session) {
  if (!session) return false;
  // Mốc bắt đầu của phiên: đặt ở lần gọi đầu tiên (attachAutofill gọi ngay khi gắn phiên, trước mọi lượt kiểm lead).
  session.leadHistoryBaselineAt ??= Date.now();
  const exitIp = normalizeIpAddress(session.exitIp) || normalizeIpAddress(session.confirmedLeadIp);
  if (!exitIp) return false;
  const history = leadIpStatsMap.get(exitIp);
  const confirmedDuringSession = Boolean(history) && Date.parse(history.confirmedAt) >= session.leadHistoryBaselineAt;
  if (session.confirmedLeadIp === exitIp || (session.leadCheckStatus === 'confirmed' && (!session.confirmedLeadIp || session.confirmedLeadIp === exitIp)) || confirmedDuringSession) {
    session.confirmedLeadIp = exitIp;
    session.leadCheckStatus = 'confirmed';
    session.screen5LeadVerified = true;
    session.closingDueToNoLead = false;
    session.closingDueToTrafficBlocked = false;
    return true;
  }
  return false;
}
