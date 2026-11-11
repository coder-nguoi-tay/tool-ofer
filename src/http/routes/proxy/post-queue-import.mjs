import { parseProxyLine } from '../../../proxy/configuration.mjs';
import { proxyQueue } from '../../../runtime/constants/proxy-queue.mjs';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { saveProxyQueue } from '../../../proxy/actions/save-proxy-queue.mjs';
import { importProxyLines } from '../../../proxy/actions/import-proxy-lines.mjs';

/**
 * Nhập proxy theo chế độ thêm mới hoặc đồng bộ danh sách, giữ nguyên lịch sử đã dùng.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @throws {Error} Khi không đọc được JSON yêu cầu hoặc không lưu được hàng đợi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function handlePostProxyQueueImport(request, response) {
  if (request.method === 'POST' && request.url === '/proxy-queue/import') {
    const body = JSON.parse(await readRequestBody(request));
    const proxyType = body.proxyType ?? 'socks5';
    const rawLines = (body.proxyList ?? '').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    if (body.mode === 'append') {
      const added = importProxyLines(rawLines, proxyType);
      await saveProxyQueue();
      respondWithJson(response, 200, {
        added,
        available: proxyQueue.available.length,
        used: proxyQueue.used.length,
        message: `Đã thêm ${added} proxy vào hàng đợi. Bỏ qua dòng trùng hoặc không hợp lệ.`
      });
      return true;
    }
    // Validate từng dòng
    const validLines = rawLines.filter(line => {
      try {
        parseProxyLine(line, 1, proxyType);
        return true;
      } catch {
        return false;
      }
    });
    // Đồng bộ: available = danh sách hợp lệ từ textarea, trừ những proxy đã dùng
    const usedSet = new Set(proxyQueue.used.map(l => l.trim()));
    proxyQueue.available = validLines.filter(l => !usedSet.has(l));
    await saveProxyQueue();
    respondWithJson(response, 200, {
      available: proxyQueue.available.length,
      used: proxyQueue.used.length,
      message: `Đã đồng bộ: ${proxyQueue.available.length} proxy sẵn sàng, ${proxyQueue.used.length} đã dùng.`
    });
    return true;
  }
  return false;
}
