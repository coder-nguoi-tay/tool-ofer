import { autofillQueue } from '../../../runtime/constants/autofill-queue.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API autofill-queue.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetAutofillQueue(request, response) {
  if (request.method === 'GET' && request.url === '/autofill-queue') {
    respondWithJson(response, 200, {
      available: autofillQueue.available.length,
      used: autofillQueue.used.length,
      availableList: autofillQueue.available.slice(0, 100),
      usedList: autofillQueue.used.slice(-50)
    });
    return true;
  }
  return false;
}
