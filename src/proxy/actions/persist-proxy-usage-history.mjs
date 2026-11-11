import { applicationState } from '../../runtime/application-state.mjs';
import { writeProxyUsageHistory } from './write-proxy-usage-history.mjs';

/**
 * Tuần tự lưu lịch sử dùng chung để các worker không ghi đè snapshot của nhau.
 *
 * @param {object} history Lịch sử proxy đã thử.
 * @return {Promise<void>} Hoàn tất khi lịch sử đã được lưu.
 * @throws {Error} Khi không thể ghi lịch sử xuống đĩa.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function persistProxyUsageHistory(history) {
  const result = applicationState.proxyHistoryWriteQueue.then(() => writeProxyUsageHistory(history));
  applicationState.proxyHistoryWriteQueue = result.catch(() => {});
  return result;
}
