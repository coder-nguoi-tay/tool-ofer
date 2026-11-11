import { emailQueue } from '../../../queues/email.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { saveEmailQueue } from '../../../queues/email.mjs';

/**
 * Xử lý API email-queue-reset.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostEmailQueueReset(request, response) {
  if (request.method === 'POST' && request.url === '/email-queue/reset') {
    emailQueue.available.push(...emailQueue.used.splice(0));
    await saveEmailQueue();
    respondWithJson(response, 200, {
      available: emailQueue.available.length,
      used: 0,
      message: `Đã đặt lại: ${emailQueue.available.length} email mẫu sẵn sàng dùng lại.`
    });
    return true;
  }
  return false;
}
