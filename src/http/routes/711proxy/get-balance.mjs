import { get711Balance } from '../../../proxy/provider711.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API 711proxy-balance.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGet711proxyBalance(request, response) {
  if (request.method === 'GET' && (request.url === '/711proxy/balance' || request.url.startsWith('/711proxy/balance?'))) {
    const urlObj = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const force = urlObj.searchParams.get('refresh') === '1' || urlObj.searchParams.get('force') === '1';
    const bal = await get711Balance(force);
    respondWithJson(response, bal.ok ? 200 : 400, bal);
    return true;
  }
  return false;
}
