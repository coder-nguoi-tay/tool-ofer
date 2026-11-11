import { proxyUsageHistoryPath } from '../../runtime/constants/proxy-usage-history-path.mjs';
import { readFile } from 'node:fs/promises';

/**
 * Đọc lịch sử proxy đã thử để không dùng lại proxy thành công hoặc thất bại.
 *
 * @return {Promise<{version: number, proxies: Record<string, object>}>} Lịch sử proxy đã dùng.
 * @throws {Error} Khi file lịch sử bị hỏng hoặc không thể đọc.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function readProxyUsageHistory() {
  let history;
  try {
    history = JSON.parse(await readFile(proxyUsageHistoryPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {
      version: 1,
      proxies: {}
    };
    throw new Error(`Không đọc được lịch sử proxy đã dùng: ${error.message}`);
  }
  if (history?.version !== 1 || !history.proxies || typeof history.proxies !== 'object') {
    throw new Error('File lịch sử proxy không đúng định dạng; dừng mở để tránh dùng lại IP cũ.');
  }
  return history;
}
