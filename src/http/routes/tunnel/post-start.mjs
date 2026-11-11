import { port } from '../../../runtime/constants/port.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { startTunnel } from '../../../../tunnel.mjs';

/**
 * Xử lý API tunnel-start.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostTunnelStart(request, response) {
  if (request.method === 'POST' && request.url === '/tunnel/start') {
    const res = await startTunnel(port);
    respondWithJson(response, res.ok ? 200 : 500, res);
    return true;
  }
  return false;
}
