import { proxy711AutoRefill } from '../../../runtime/constants/proxy711-auto-refill.mjs';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { saveProxy711AutoRefillConfig } from '../../../proxy/actions/save-proxy711-auto-refill-config.mjs';

/**
 * Xử lý API 711proxy-autorefill.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePost711proxyAutorefill(request, response) {
  if (request.method === 'POST' && request.url === '/711proxy/autorefill') {
    const body = JSON.parse(await readRequestBody(request));
    if (typeof body.enabled === 'boolean') proxy711AutoRefill.enabled = body.enabled;
    if (typeof body.region === 'string') proxy711AutoRefill.region = body.region;
    if (typeof body.count === 'number') proxy711AutoRefill.count = body.count;
    if (typeof body.sessTime === 'number') proxy711AutoRefill.sessTime = body.sessTime;
    if (typeof body.sessAuto === 'boolean') proxy711AutoRefill.sessAuto = body.sessAuto;
    await saveProxy711AutoRefillConfig();
    respondWithJson(response, 200, {
      ...proxy711AutoRefill
    });
    return true;
  }
  return false;
}
