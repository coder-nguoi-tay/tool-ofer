import { autoRefill } from '../../../runtime/constants/auto-refill.mjs';
import { normalizeUrl } from '../../../proxy/configuration.mjs';
import { queueAutomaticRefill } from '../../../refill/actions/queue-automatic-refill.mjs';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API auto-refill-sequential.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostAutoRefillSequential(request, response) {
  if (request.method === 'POST' && request.url === '/auto-refill/sequential') {
    const body = JSON.parse(await readRequestBody(request));
    autoRefill.sequential = body.enabled !== false;
    if (autoRefill.sequential) {
      autoRefill.enabled = true;
      const s = body.settings ?? autoRefill.settings ?? {};
      let url1 = s.websiteUrl ? normalizeUrl(s.websiteUrl) : '';
      let url2 = s.websiteUrl2 ? normalizeUrl(s.websiteUrl2) : '';
      if (!url2 && url1 && /[\r\n,]/.test(s.websiteUrl)) {
        const parts = s.websiteUrl.split(/[\r\n,]+/).map(u => u.trim()).filter(Boolean);
        if (parts.length >= 2) {
          url1 = normalizeUrl(parts[0]);
          url2 = normalizeUrl(parts[1]);
        }
      }
      const isDual = Boolean(url1 && url2 && url1 !== url2);
      autoRefill.targetCount = isDual ? 2 : 1;
      autoRefill.settings = {
        ...s,
        websiteUrl: url1 || s.websiteUrl,
        websiteUrl2: url2 || s.websiteUrl2,
        checkDuplicate: s.checkDuplicate !== false
      };
      autoRefill.message = isDual ? 'Chế độ tuần tự 2 luồng đã bật: chạy đồng thời cả 2 link (Luồng 1 từ đầu, Luồng 2 từ cuối), delay 5s giữa các phiên.' : 'Chế độ tuần tự đã bật: mở 1 tab mỗi lần, delay 5s giữa các phiên.';
      if (body.settings) queueAutomaticRefill(0);
    } else {
      autoRefill.sequential = false;
      autoRefill.message = 'Chế độ tuần tự đã tắt.';
    }
    respondWithJson(response, 200, {
      sequential: autoRefill.sequential,
      message: autoRefill.message,
      targetCount: autoRefill.targetCount
    });
    return true;
  }
  return false;
}
