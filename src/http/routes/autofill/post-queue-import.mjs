import { applicationState } from '../../../runtime/application-state.mjs';
import { autofillQueue } from '../../../runtime/constants/autofill-queue.mjs';
import { importAutofillRecords } from '../../../records/actions/import-autofill-records.mjs';
import { parseAutofillRecords } from '../../../../autofill.mjs';
import { readFile } from 'node:fs/promises';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { saveAutofillQueue } from '../../../records/actions/save-autofill-queue.mjs';

/**
 * Xử lý API autofill-queue-import.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostAutofillQueueImport(request, response) {
  if (request.method === 'POST' && request.url === '/autofill-queue/import') {
    try {
      const body = JSON.parse(await readRequestBody(request));
      let records = [];
      if (body.filePath) {
        const content = await readFile(body.filePath, 'utf8');
        records = parseAutofillRecords(content);
      } else if (body.autofillData) {
        records = parseAutofillRecords(typeof body.autofillData === 'string' ? body.autofillData : JSON.stringify(body.autofillData));
      }
      if (body.replace) {
        autofillQueue.available = [];
        autofillQueue.used = [];
        applicationState.autofillUsedKeys.clear();
      }
      const added = importAutofillRecords(records);
      if (added > 0) await saveAutofillQueue();
      respondWithJson(response, 200, {
        success: true,
        added,
        available: autofillQueue.available.length,
        used: autofillQueue.used.length,
        message: `Đã nạp ${added} bản ghi info mới (tổng sẵn sàng: ${autofillQueue.available.length}).`
      });
    } catch (err) {
      respondWithJson(response, 400, {
        error: err.message
      });
    }
    return true;
  }
  return false;
}
