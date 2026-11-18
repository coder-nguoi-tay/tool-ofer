import { fetchToffersNetworks } from '../../../../lead-check.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { DEFAULT_LEAD_CONFIG } from '../../../../lead-check.mjs';

/**
 * Xử lý endpoint /toffers/networks lấy danh sách network từ toffers.top.
 *
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True nếu route đã được xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
export async function handleGetToffersNetworks(request, response) {
  if (
    (request.method === 'GET' && (request.url === '/toffers/networks' || request.url.startsWith('/toffers/networks?'))) ||
    (request.method === 'POST' && (request.url === '/toffers/networks' || request.url.startsWith('/toffers/networks?')))
  ) {
    let bodyText = '';
    if (request.method === 'POST') {
      for await (const chunk of request) bodyText += chunk;
    }

    let params = {};
    try {
      if (bodyText) params = JSON.parse(bodyText);
    } catch {}

    const urlObj = new URL(request.url, 'http://localhost');
    const cookie = params.cookie || urlObj.searchParams.get('cookie') || DEFAULT_LEAD_CONFIG.cookie;

    try {
      const networks = await fetchToffersNetworks({ cookie });
      respondWithJson(response, 200, {
        success: true,
        networks
      });
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
