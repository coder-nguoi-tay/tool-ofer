import { emailQueue } from '../../../queues/email.mjs';
import { importEmailLines } from '../../../queues/email.mjs';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { saveEmailQueue } from '../../../queues/email.mjs';

/**
 * Xử lý API email-queue-import.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostEmailQueueImport(request, response) {
  if (request.method === 'POST' && request.url === '/email-queue/import') {
    const body = JSON.parse(await readRequestBody(request));
    const rawLines = (body.emailList ?? '').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    const added = importEmailLines(rawLines);
    if (added > 0) await saveEmailQueue();
    respondWithJson(response, 200, {
      added,
      available: emailQueue.available.length,
      used: emailQueue.used.length,
      message: `Đã nạp ${added} email mới (tổng sẵn sàng: ${emailQueue.available.length}).`
    });
    return true;
  }
  return false;
}
