import { proxy711AutoRefill } from '../../../runtime/constants/proxy711-auto-refill.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API 711proxy-autorefill.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGet711proxyAutorefill(request, response) {
  if (request.method === 'GET' && request.url === '/711proxy/autorefill') {
    respondWithJson(response, 200, {
      ...proxy711AutoRefill
    });
    return true;
  }
  return false;
}
