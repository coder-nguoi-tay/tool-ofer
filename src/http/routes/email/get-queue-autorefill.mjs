import { emailAutoRefill } from '../../../queues/email.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API email-queue-autorefill.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetEmailQueueAutorefill(request, response) {
  if (request.method === 'GET' && request.url === '/email-queue/autorefill') {
    respondWithJson(response, 200, {
      ...emailAutoRefill
    });
    return true;
  }
  return false;
}
