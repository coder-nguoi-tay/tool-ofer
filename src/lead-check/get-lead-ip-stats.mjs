import { leadIpStatsMap } from './state/lead-ip-stats-map.mjs';
import { normalizeIpAddress } from './normalize-ip-address.mjs';

/**
 * Lấy danh sách hoặc thông tin IP có lead đã lưu.
 *
 * @param {string} [ip] IP cần tra cứu (tùy chọn).
 * @return {object|null|Array<object>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function getLeadIpStats(ip = '') {
  if (ip) {
    return leadIpStatsMap.get(normalizeIpAddress(ip)) || null;
  }
  return Array.from(leadIpStatsMap.values());
}
export { getLeadIpStats };
