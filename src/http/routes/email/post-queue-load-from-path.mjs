import { access } from 'node:fs/promises';
import { emailAutoRefill } from '../../../queues/email.mjs';
import { emailQueue } from '../../../queues/email.mjs';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { refillEmailBatchFromSource } from '../../../queues/email.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { saveEmailAutoRefillConfig } from '../../../queues/email.mjs';

/**
 * Xử lý API email-queue-load-from-path.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostEmailQueueLoadFromPath(request, response) {
  if (request.method === 'POST' && request.url === '/email-queue/load-from-path') {
    const body = JSON.parse(await readRequestBody(request));
    const sourcePath = String(body.sourcePath ?? emailAutoRefill.sourcePath).trim();
    try {
      await access(sourcePath);
    } catch {
      respondWithJson(response, 400, {
        error: `Không đọc được file: ${sourcePath || '(chưa nhập path)'}`
      });
      return true;
    }
    if (sourcePath !== emailAutoRefill.sourcePath) emailAutoRefill.byteOffset = 0;
    emailAutoRefill.sourcePath = sourcePath;
    if (typeof body.batchSize === 'number' && body.batchSize > 0) emailAutoRefill.batchSize = body.batchSize;
    const added = await refillEmailBatchFromSource();
    await saveEmailAutoRefillConfig();
    respondWithJson(response, 200, {
      added,
      available: emailQueue.available.length,
      message: added > 0 ? `Đã nạp ${added} email từ file (tổng sẵn sàng: ${emailQueue.available.length}).` : 'Không có email mới: đã đọc hết file (bấm "Reset vị trí" để đọc lại từ đầu).'
    });
    return true;
  }
  return false;
}
