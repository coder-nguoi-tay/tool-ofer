import { proxy711 } from '../../../proxy/provider711.mjs';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { saveProxy711Config } from '../../../proxy/provider711.mjs';

/**
 * Xử lý API 711proxy-config.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePost711proxyConfig(request, response) {
  if (request.method === 'POST' && request.url === '/711proxy/config') {
    try {
      const body = JSON.parse(await readRequestBody(request));
      if (body.authMode) proxy711.authMode = body.authMode;
      if (body.subuser !== undefined) proxy711.subuser = String(body.subuser).trim();
      if (body.subpass !== undefined) proxy711.subpass = String(body.subpass).trim();
      if (body.gatewayHost) proxy711.gatewayHost = String(body.gatewayHost).trim();
      if (body.gatewayPort) proxy711.gatewayPort = parseInt(body.gatewayPort) || 10000;
      await saveProxy711Config();
      respondWithJson(response, 200, {
        ok: true,
        config: proxy711
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
