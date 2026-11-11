import { parseProxyLine } from '../../../proxy/configuration.mjs';
import { persistProxyUsageHistory } from '../../../proxy/actions/persist-proxy-usage-history.mjs';
import { proxyQueue } from '../../../runtime/constants/proxy-queue.mjs';
import { readProxyUsageHistory } from '../../../proxy/actions/read-proxy-usage-history.mjs';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { resetMultiOfferState } from '../../../leads/actions/reset-multi-offer-state.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { saveDualStreamState } from '../../../runtime/actions/save-dual-stream-state.mjs';
import { saveProxyQueue } from '../../../proxy/actions/save-proxy-queue.mjs';

/**
 * Xử lý API proxy-queue-reset.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostProxyQueueReset(request, response) {
  if (request.method === 'POST' && request.url === '/proxy-queue/reset') {
    const body = JSON.parse(await readRequestBody(request));
    const rawLines = (body.proxyList ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const clearAll = body.clearAllUsedIps === true || rawLines.length === 0;
    if (!clearAll && rawLines.length > 0) {
      // Chỉ reset proxy nằm trong danh sách hiện tại của textarea
      const allowedSet = new Set(rawLines);
      const toRestore = proxyQueue.used.filter(line => allowedSet.has(line.trim()));
      const keepUsed = proxyQueue.used.filter(line => !allowedSet.has(line.trim()));
      proxyQueue.available.push(...toRestore);
      proxyQueue.used = keepUsed;
    } else {
      // Reset toàn bộ
      proxyQueue.available.push(...proxyQueue.used.splice(0));
    }
    await saveProxyQueue();
    resetMultiOfferState();
    await saveDualStreamState();

    // Xoá bản ghi trong usageHistory cho các proxy được reset để không bị chặn bởi lượt cũ
    try {
      const history = await readProxyUsageHistory();
      if (clearAll) {
        history.proxies = {};
      } else if (rawLines.length > 0) {
        const allowedServers = new Set(rawLines.map(l => {
          try {
            return parseProxyLine(l, 1, 'socks5')?.server;
          } catch {
            return null;
          }
        }).filter(Boolean));
        for (const key of Object.keys(history.proxies)) {
          const entry = history.proxies[key];
          if (entry) {
            const matched = allowedServers.has(entry.proxy) || allowedServers.has(entry.server) || rawLines.some(rl => entry.proxy?.includes(rl) || entry.server?.includes(rl));
            if (matched) {
              delete history.proxies[key];
            }
          }
        }
      }
      await persistProxyUsageHistory(history);
    } catch {}
    respondWithJson(response, 200, {
      available: proxyQueue.available.length,
      used: proxyQueue.used.length,
      message: `Đã đặt lại: ${proxyQueue.available.length} proxy sẵn sàng dùng lại (đã làm sạch lịch sử trùng IP).`
    });
    return true;
  }
  return false;
}
