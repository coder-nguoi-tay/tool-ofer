import { applicationState } from '../../../runtime/application-state.mjs';
import { autofillUsedPath } from '../../../runtime/constants/autofill-used-path.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { writeFile } from 'node:fs/promises';

/**
 * Xử lý API autofill-used-clear.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostAutofillUsedClear(request, response) {
  if (request.method === 'POST' && request.url === '/autofill-used/clear') {
    applicationState.autofillUsedKeys.clear();
    await writeFile(autofillUsedPath, JSON.stringify({
      keys: []
    })).catch(() => {});
    respondWithJson(response, 200, {
      message: 'Đã xóa toàn bộ thông tin đã dùng.'
    });
    return true;
  }
  return false;
}
