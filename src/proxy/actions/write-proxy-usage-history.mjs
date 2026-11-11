import { dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { proxyUsageHistoryPath } from '../../runtime/constants/proxy-usage-history-path.mjs';
import { randomUUID } from 'node:crypto';
import { rename } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';

/**
 * Ghi lịch sử proxy theo cách nguyên tử và giới hạn quyền file cho tài khoản hiện tại.
 *
 * @param {{version: number, proxies: Record<string, object>}} history Lịch sử cần lưu.
 * @return {Promise<void>} Hoàn tất khi lịch sử đã được thay thế trên đĩa.
 * @throws {Error} Khi không thể lưu lịch sử proxy.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function writeProxyUsageHistory(history) {
  await mkdir(dirname(proxyUsageHistoryPath), {
    recursive: true,
    mode: 0o700
  });
  const temporaryPath = `${proxyUsageHistoryPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(history, null, 2), {
    encoding: 'utf8',
    mode: 0o600
  });
  await rename(temporaryPath, proxyUsageHistoryPath);
}
