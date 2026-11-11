import { leadIpStatsMap, normalizeIpAddress } from '../../../lead-check.mjs';

/**
 * Giữ cờ có lead theo IP của phiên trình duyệt, độc lập với trạng thái DOM sau tải lại trang.
 * Khôi phục từ lịch sử IP có lead và chỉ áp dụng cho đúng IP đã được xác nhận.
 * @param {object} session Phiên trình duyệt cần bảo vệ khỏi các nhánh tự đóng.
 * @return {boolean} True khi IP đã có lead và phiên phải được giữ mở.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function protectConfirmedLeadSession(session) {
  const exitIp = normalizeIpAddress(session?.exitIp);
  if (!exitIp) return false;
  if (session.confirmedLeadIp === exitIp || (session.leadCheckStatus === 'confirmed' && !session.confirmedLeadIp) || leadIpStatsMap.has(exitIp)) {
    session.confirmedLeadIp = exitIp;
    session.leadCheckStatus = 'confirmed';
    session.screen5LeadVerified = true;
    session.closingDueToNoLead = false;
    session.closingDueToTrafficBlocked = false;
    return true;
  }
  return false;
}
