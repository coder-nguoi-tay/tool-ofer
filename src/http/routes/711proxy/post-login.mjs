import { add711IpWhitelist } from '../../../proxy/provider711.mjs';
import { fetch711Token } from '../../../proxy/provider711.mjs';
import { proxy711 } from '../../../proxy/provider711.mjs';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API 711proxy-login.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePost711proxyLogin(request, response) {
  if (request.method === 'POST' && request.url === '/711proxy/login') {
    const body = JSON.parse(await readRequestBody(request));
    const {
      username,
      passwd
    } = body;
    if (!username || !passwd) {
      respondWithJson(response, 400, {
        error: 'Cần username và passwd.'
      });
      return true;
    }
    try {
      await fetch711Token(username, passwd);
      // Sau khi đăng nhập thành công, tự động thêm ngay IP hiện tại vào whitelist:
      let whitelistResult = null;
      try {
        const ipRes = await fetch('https://api.ipify.org?format=json').catch(() => null);
        const ip = ipRes ? (await ipRes.json().catch(() => ({}))).ip : null;
        if (ip) {
          whitelistResult = await add711IpWhitelist(ip, proxy711.token).catch(wErr => ({
            ok: false,
            error: wErr.message
          }));
        }
      } catch {}
      respondWithJson(response, 200, {
        ok: true,
        username,
        whitelist: whitelistResult
      });
    } catch (e) {
      respondWithJson(response, 400, {
        error: e.message
      });
    }
    return true;
  }
  return false;
}
