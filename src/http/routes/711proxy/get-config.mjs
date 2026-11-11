import { proxy711 } from '../../../proxy/provider711.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API 711proxy-config.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGet711proxyConfig(request, response) {
  if (request.method === 'GET' && request.url === '/711proxy/config') {
    respondWithJson(response, 200, {
      username: proxy711.username,
      passwd: proxy711.passwd || '',
      hasToken: Boolean(proxy711.token && Date.now() < proxy711.tokenExpiry),
      authMode: proxy711.authMode || 'subuser',
      subuser: proxy711.subuser || '',
      subpass: proxy711.subpass || '',
      gatewayHost: proxy711.gatewayHost || 'global.rotgbapi.trustsource.live',
      gatewayPort: proxy711.gatewayPort || 10000
    });
    return true;
  }
  return false;
}
