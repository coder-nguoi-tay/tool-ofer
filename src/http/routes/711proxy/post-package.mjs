import { proxy711 } from '../../../proxy/provider711.mjs';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { saveProxy711Config } from '../../../proxy/provider711.mjs';

/**
 * Xử lý API 711proxy-package.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePost711proxyPackage(request, response) {
  if (request.method === 'POST' && request.url === '/711proxy/package') {
    try {
      const body = JSON.parse(await readRequestBody(request));
      const val = Number(body.packageGb);
      if (!val || val <= 0 || isNaN(val)) {
        respondWithJson(response, 400, {
          error: 'Số GB gói không hợp lệ.'
        });
        return true;
      }
      proxy711.packageGb = val;
      await saveProxy711Config();
      if (cached711Balance.ok) {
        const remainingGb = cached711Balance.remainingGb;
        const usedGb = Math.max(0, Number((val - remainingGb).toFixed(3)));
        const usedPercent = val > 0 ? Math.min(100, Number((usedGb / val * 100).toFixed(1))) : 0;
        cached711Balance = {
          ...cached711Balance,
          packageGb: val,
          packageFormatted: `${val.toFixed(2)} GB`,
          usedGb,
          usedFormatted: `${usedGb.toFixed(2)} GB`,
          usedPercent,
          remainingPercent: Number(Math.max(0, 100 - usedPercent).toFixed(1))
        };
      }
      respondWithJson(response, 200, {
        ok: true,
        packageGb: val,
        balance: cached711Balance
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
