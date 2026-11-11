import { emailAutoRefill } from '../../../queues/email.mjs';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { saveEmailAutoRefillConfig } from '../../../queues/email.mjs';

/**
 * Xử lý API email-queue-autorefill.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostEmailQueueAutorefill(request, response) {
  if (request.method === 'POST' && request.url === '/email-queue/autorefill') {
    const body = JSON.parse(await readRequestBody(request));
    if (typeof body.enabled === 'boolean') emailAutoRefill.enabled = body.enabled;
    if (typeof body.sourcePath === 'string') emailAutoRefill.sourcePath = body.sourcePath;
    if (typeof body.batchSize === 'number' && body.batchSize > 0) emailAutoRefill.batchSize = body.batchSize;
    if (body.resetCursor) emailAutoRefill.byteOffset = 0;
    await saveEmailAutoRefillConfig();
    respondWithJson(response, 200, {
      ...emailAutoRefill,
      message: 'Đã lưu cấu hình tự động nạp email.'
    });
    return true;
  }
  return false;
}
