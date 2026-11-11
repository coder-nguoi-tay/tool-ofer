// completed: phiên đã tới thankyou (handleThankYouClose ghi đè success).
const CONSUMED_STATUSES = new Set(['success', 'completed', 'duplicate_ip', 'offer_unavailable']);

/**
 * IP thoát của bản ghi lịch sử đã vào trang offer (đã click), không được mở lại cho cùng trang đích.
 * Trước đây chỉ tính `success`, nên phiên bị đóng vì duplicate IP hay offer hết hạn (ghi `failed`)
 * làm IP đó rơi khỏi danh sách chống trùng.
 *
 * @param {object} entry Bản ghi trong usageHistory.proxies.
 * @return {boolean} True nếu IP đã được dùng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function isExitIpConsumed(entry) {
  return Boolean(entry?.exitIp) && CONSUMED_STATUSES.has(entry.status);
}

/**
 * Trạng thái ghi lịch sử proxy khi watcher đóng phiên.
 *
 * @param {string} reason Lý do đóng.
 * @param {boolean} fromNonOffer Lý do đến từ nhận diện "không phải trang offer".
 * @return {'duplicate_ip'|'offer_unavailable'|'failed'} Trạng thái lịch sử.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function closeHistoryStatus(reason, fromNonOffer) {
  if (reason.includes('Toffers Duplicate IP') || reason.includes('click offer')) return 'duplicate_ip';
  return fromNonOffer ? 'offer_unavailable' : 'failed';
}
