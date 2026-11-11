import { clearAllProxyQueue } from '../../../proxy/actions/clear-all-proxy-queue.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API proxy-queue-clear.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostProxyQueueClear(request, response) {
  if (request.method === 'POST' && request.url === '/proxy-queue/clear') {
    const result = await clearAllProxyQueue();
    respondWithJson(response, 200, result);
    return true;
  }
  return false;
}
