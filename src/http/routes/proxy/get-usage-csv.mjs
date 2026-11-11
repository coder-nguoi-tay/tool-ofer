import { buildProxyUsageHistoryCsv } from '../../../proxy/actions/build-proxy-usage-history-csv.mjs';
import { readProxyUsageHistory } from '../../../proxy/actions/read-proxy-usage-history.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API proxy-usage-csv.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetProxyUsageCsv(request, response) {
  if (request.method === 'GET' && request.url === '/proxy-usage.csv') {
    try {
      const history = await readProxyUsageHistory();
      const csv = buildProxyUsageHistoryCsv(history);
      response.writeHead(200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="proxy-usage-history.csv"',
        'cache-control': 'no-store'
      });
      response.end(`\uFEFF${csv}`);
    } catch (error) {
      respondWithJson(response, 500, {
        error: error.message
      });
    }
    return true;
  }
  return false;
}
