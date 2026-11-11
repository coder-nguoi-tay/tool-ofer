import { leadIpStatsMap } from './state/lead-ip-stats-map.mjs';

/**
 * Xóa toàn bộ thống kê IP có lead.
 * @return {void} Kết quả xử lý clear lead ip stats.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function clearLeadIpStats() {
  leadIpStatsMap.clear();
}
export { clearLeadIpStats };
