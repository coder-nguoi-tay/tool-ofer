import { buildUsedExitIpList } from './build-used-exit-ip-list.mjs';
import { readProxyUsageHistory } from './read-proxy-usage-history.mjs';

/**
 * Trả danh sách IP exit đã dùng để giao diện hiện bảng.
 *
 * @return {Promise<{ips: object[], results: string[], warnings: string[]}>} Danh sách IP và dòng tóm tắt.
 * @throws {Error} Khi không đọc được lịch sử proxy.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function listUsedExitIps() {
  const usageHistory = await readProxyUsageHistory();
  const ips = buildUsedExitIpList(usageHistory);
  return {
    ips,
    results: [ips.length > 0 ? `Đã dùng ${ips.length} IP exit; các lượt mở sau sẽ không dùng lại các IP này.` : 'Chưa có IP exit nào trong lịch sử.'],
    warnings: []
  };
}
