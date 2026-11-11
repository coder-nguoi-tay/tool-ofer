import { emailQueue } from '../../../queues/email.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API email-queue.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetEmailQueue(request, response) {
  if (request.method === 'GET' && request.url === '/email-queue') {
    respondWithJson(response, 200, {
      available: emailQueue.available.length,
      used: emailQueue.used.length,
      availableList: emailQueue.available,
      usedList: emailQueue.used
    });
    return true;
  }
  return false;
}
