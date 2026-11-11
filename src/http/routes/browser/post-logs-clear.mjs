import { clearAllLogsAndHtml } from '../../../logging/browser-logs.mjs';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API browser-logs-clear.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostBrowserLogsClear(request, response) {
  if (request.method === 'POST' && request.url === '/browser-logs/clear') {
    try {
      const rawBody = await readRequestBody(request).catch(() => '{}');
      const body = rawBody ? JSON.parse(rawBody) : {};
      const result = await clearAllLogsAndHtml(body.offer);
      respondWithJson(response, 200, result);
    } catch {
      const result = await clearAllLogsAndHtml();
      respondWithJson(response, 200, result);
    }
    return true;
  }
  return false;
}
