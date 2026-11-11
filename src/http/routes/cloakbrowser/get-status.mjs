import { getCloakBrowserStatus } from '../../../../cloakbrowser-engine.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API cloakbrowser-status.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetCloakbrowserStatus(request, response) {
  if (request.method === 'GET' && request.url === '/cloakbrowser/status') {
    try {
      const status = getCloakBrowserStatus();
      respondWithJson(response, 200, status);
    } catch (err) {
      respondWithJson(response, 500, {
        error: err.message
      });
    }
    return true;
  }
  return false;
}
