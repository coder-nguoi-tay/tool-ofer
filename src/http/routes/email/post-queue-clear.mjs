import { emailQueue } from '../../../queues/email.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { saveEmailQueue } from '../../../queues/email.mjs';

/**
 * Xử lý API email-queue-clear.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostEmailQueueClear(request, response) {
  if (request.method === 'POST' && request.url === '/email-queue/clear') {
    const count = emailQueue.available.length + emailQueue.used.length;
    emailQueue.available.length = 0;
    emailQueue.used.length = 0;
    await saveEmailQueue();
    respondWithJson(response, 200, {
      message: `Đã xóa tất cả ${count} gmail.`
    });
    return true;
  }
  return false;
}
