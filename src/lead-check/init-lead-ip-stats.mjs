import { leadIpStatsMap } from './state/lead-ip-stats-map.mjs';
import { recordLeadIpStats } from './record-lead-ip-stats.mjs';

/**
 * Khởi tạo dữ liệu từ object hoặc JSON đã lưu.
 *
 * @param {object|Array} data Dữ liệu đã lưu từ file disk.
 * @return {void} Kết quả xử lý init lead ip stats.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function initLeadIpStats(data) {
  leadIpStatsMap.clear();
  if (Array.isArray(data)) {
    for (const item of data) {
      if (item && item.ip) recordLeadIpStats(item);
    }
  } else if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === 'object') {
        recordLeadIpStats({
          ip: k,
          ...v
        });
      }
    }
  }
}
export { initLeadIpStats };
