import { latestToffersOverview } from '../../../leads/toffers-overview.mjs';
import { leadIpStatsMap } from '../../../../lead-check.mjs';
import { refreshToffersOverview } from '../../../leads/toffers-overview.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API toffers-overview.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetToffersOverview(request, response) {
  if (request.method === 'GET' && (request.url === '/toffers/overview' || request.url.startsWith('/toffers/overview?')) || request.method === 'POST' && request.url === '/toffers/overview') {
    let bodyText = '';
    if (request.method === 'POST') {
      for await (const chunk of request) bodyText += chunk;
    }
    let params = {};
    try {
      if (bodyText) params = JSON.parse(bodyText);
    } catch {}
    const urlObj = new URL(request.url, 'http://localhost');
    const datas = params.datas || urlObj.searchParams.get('datas');
    const cookie = params.cookie || urlObj.searchParams.get('cookie');
    const pointUrl = params.pointUrl || urlObj.searchParams.get('pointUrl');
    const apiUrl = params.apiUrl || urlObj.searchParams.get('apiUrl');
    const forceRefresh = params.forceRefresh === true || urlObj.searchParams.get('force') === 'true';
    const customCfg = {};
    if (datas) customCfg.datas = datas;
    if (cookie) customCfg.cookie = cookie;
    if (pointUrl) customCfg.pointUrl = pointUrl;
    if (apiUrl) customCfg.apiUrl = apiUrl;
    const hasCustomParams = Object.keys(customCfg).length > 0;
    const isStale = !latestToffersOverview.updatedAt || Date.now() - new Date(latestToffersOverview.updatedAt).getTime() > 10_000;
    try {
      if (forceRefresh || hasCustomParams || isStale) {
        const overview = await refreshToffersOverview(hasCustomParams ? customCfg : null);
        respondWithJson(response, 200, {
          ...overview,
          leadStats: Object.fromEntries(leadIpStatsMap)
        });
      } else {
        respondWithJson(response, 200, {
          ...latestToffersOverview,
          leadStats: Object.fromEntries(leadIpStatsMap)
        });
      }
    } catch (err) {
      respondWithJson(response, 500, {
        success: false,
        error: err.message,
        code: err.code || 'UNKNOWN_ERROR'
      });
    }
    return true;
  }
  return false;
}
