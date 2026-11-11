import { proxy711 } from '../../../proxy/provider711.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { saveProxy711Config } from '../../../proxy/provider711.mjs';

/**
 * Xử lý API 711proxy-logout.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePost711proxyLogout(request, response) {
  if (request.method === 'POST' && request.url === '/711proxy/logout') {
    proxy711.token = '';
    proxy711.tokenExpiry = 0;
    await saveProxy711Config();
    respondWithJson(response, 200, {
      ok: true
    });
    return true;
  }
  return false;
}
