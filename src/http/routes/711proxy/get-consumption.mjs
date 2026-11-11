import { get711ConsumptionChart } from '../../../proxy/provider711.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API 711proxy-consumption.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGet711proxyConsumption(request, response) {
  if (request.method === 'GET' && (request.url === '/711proxy/consumption' || request.url.startsWith('/711proxy/consumption?'))) {
    const urlObj = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const days = urlObj.searchParams.get('days') || 1;
    try {
      const chartData = await get711ConsumptionChart({
        days
      });
      respondWithJson(response, 200, chartData);
    } catch (err) {
      respondWithJson(response, 500, {
        ok: false,
        error: err.message
      });
    }
    return true;
  }
  return false;
}
