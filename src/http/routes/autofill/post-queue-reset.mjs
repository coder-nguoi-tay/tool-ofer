import { applicationState } from '../../../runtime/application-state.mjs';
import { autofillQueue } from '../../../runtime/constants/autofill-queue.mjs';
import { autofillUsedPath } from '../../../runtime/constants/autofill-used-path.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { saveAutofillQueue } from '../../../records/actions/save-autofill-queue.mjs';
import { writeFile } from 'node:fs/promises';

/**
 * Xử lý API autofill-queue-reset.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostAutofillQueueReset(request, response) {
  if (request.method === 'POST' && request.url === '/autofill-queue/reset') {
    autofillQueue.available.push(...autofillQueue.used.splice(0));
    applicationState.autofillUsedKeys.clear();
    await saveAutofillQueue();
    await writeFile(autofillUsedPath, JSON.stringify({
      keys: []
    })).catch(() => {});
    respondWithJson(response, 200, {
      available: autofillQueue.available.length,
      used: 0,
      message: `Đã đặt lại: ${autofillQueue.available.length} bản ghi thông tin sẵn sàng dùng lại.`
    });
    return true;
  }
  return false;
}
