import { persistProxyUsageHistory } from './persist-proxy-usage-history.mjs';
import { proxyQueue } from '../../runtime/constants/proxy-queue.mjs';
import { readProxyUsageHistory } from './read-proxy-usage-history.mjs';
import { resetMultiOfferState } from '../../leads/actions/reset-multi-offer-state.mjs';
import { saveDualStreamState } from '../../runtime/actions/save-dual-stream-state.mjs';
import { saveProxyQueue } from './save-proxy-queue.mjs';

/**
 * Xóa toàn bộ proxy trong hàng đợi (cả available và used), làm sạch lịch sử và state liên quan.
 * @return {Promise<{success: boolean, available: number, used: number, count: number, message: string}>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function clearAllProxyQueue() {
  const count = proxyQueue.available.length + proxyQueue.used.length;
  proxyQueue.available.length = 0;
  proxyQueue.used.length = 0;
  await saveProxyQueue();
  resetMultiOfferState();
  await saveDualStreamState();
  try {
    const history = await readProxyUsageHistory();
    history.proxies = {};
    await persistProxyUsageHistory(history);
  } catch {}
  return {
    success: true,
    available: 0,
    used: 0,
    count,
    message: `Đã xóa hết tất cả ${count} proxy trong hàng đợi. Bạn có thể thêm proxy mới.`
  };
}
