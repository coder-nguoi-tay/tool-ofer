import { applicationState } from '../../../runtime/application-state.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API autofill-used.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetAutofillUsed(request, response) {
  if (request.method === 'GET' && request.url === '/autofill-used') {
    const list = [...applicationState.autofillUsedKeys].map(key => {
      try {
        return JSON.parse(key);
      } catch {
        return {};
      }
    });
    respondWithJson(response, 200, {
      count: list.length,
      records: list
    });
    return true;
  }
  return false;
}
