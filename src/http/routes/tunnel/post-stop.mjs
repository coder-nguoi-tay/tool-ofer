import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { stopTunnel } from '../../../../tunnel.mjs';

/**
 * Xử lý API tunnel-stop.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostTunnelStop(request, response) {
  if (request.method === 'POST' && request.url === '/tunnel/stop') {
    stopTunnel();
    respondWithJson(response, 200, {
      ok: true
    });
    return true;
  }
  return false;
}
