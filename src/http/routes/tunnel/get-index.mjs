import { getTunnelUrl } from '../../../../tunnel.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API tunnel.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetTunnelIndex(request, response) {
  if (request.method === 'GET' && request.url === '/tunnel') {
    const url = getTunnelUrl();
    respondWithJson(response, 200, {
      ok: true,
      active: Boolean(url),
      url: url || null
    });
    return true;
  }
  return false;
}
