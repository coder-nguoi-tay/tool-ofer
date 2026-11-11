import { leadIpStatsMap } from '../../../../lead-check.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API lead-stats.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetLeadStats(request, response) {
  if (request.method === 'GET' && request.url === '/lead-stats') {
    respondWithJson(response, 200, {
      success: true,
      stats: Object.fromEntries(leadIpStatsMap),
      list: Array.from(leadIpStatsMap.values()),
      count: leadIpStatsMap.size
    });
    return true;
  }
  return false;
}
