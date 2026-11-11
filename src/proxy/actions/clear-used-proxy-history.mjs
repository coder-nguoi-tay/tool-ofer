import { chromeProfileDirectory } from '../../browser/chrome-paths.mjs';
import { join } from 'node:path';
import { persistProxyUsageHistory } from './persist-proxy-usage-history.mjs';
import { readProxyUsageHistory } from './read-proxy-usage-history.mjs';
import { resetMultiOfferState } from '../../leads/actions/reset-multi-offer-state.mjs';
import { rm } from 'node:fs/promises';
import { saveDualStreamState } from '../../runtime/actions/save-dual-stream-state.mjs';

/**
 * Xóa toàn bộ lịch sử proxy và IP đã dùng để người dùng có thể sử dụng lại từ đầu.
 *
 * @return {Promise<{results: string[], warnings: string[]}>} Kết quả xóa.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function clearUsedProxyHistory() {
  const usageHistory = await readProxyUsageHistory();
  const count = Object.keys(usageHistory.proxies).length;
  await persistProxyUsageHistory({
    version: 1,
    proxies: {}
  });
  resetMultiOfferState();
  void saveDualStreamState();
  try {
    const profilesDir = join(chromeProfileDirectory, 'stable');
    await rm(profilesDir, {
      recursive: true,
      force: true
    });
  } catch {}
  return {
    results: [`Đã xóa toàn bộ lịch sử (${count} proxy/IP đã dùng). Tất cả proxy có thể dùng lại bình thường.`],
    warnings: []
  };
}
