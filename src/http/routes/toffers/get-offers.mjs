import { fetchToffersOffers } from '../../../../lead-check.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { DEFAULT_LEAD_CONFIG } from '../../../../lead-check.mjs';

/**
 * Xử lý endpoint /toffers/offers lấy danh sách offer từ toffers.top.
 *
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True nếu route đã được xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
export async function handleGetToffersOffers(request, response) {
  if (
    (request.method === 'GET' && (request.url === '/toffers/offers' || request.url.startsWith('/toffers/offers?'))) ||
    (request.method === 'POST' && (request.url === '/toffers/offers' || request.url.startsWith('/toffers/offers?')))
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
    const type = params.type || urlObj.searchParams.get('type') || 'working';
    const start = params.start ?? urlObj.searchParams.get('start') ?? 0;
    const length = params.length ?? urlObj.searchParams.get('length') ?? 20;
    const draw = params.draw ?? urlObj.searchParams.get('draw') ?? 1;
    const cookie = params.cookie || urlObj.searchParams.get('cookie') || DEFAULT_LEAD_CONFIG.cookie;

    const filters = {
      offname: params.offname ?? urlObj.searchParams.get('offname') ?? '',
      id: params.id ?? urlObj.searchParams.get('id') ?? '',
      idoffnet: params.idoffnet ?? urlObj.searchParams.get('idoffnet') ?? '',
      agent: params.agent ?? urlObj.searchParams.get('agent') ?? '',
      link: params.link ?? urlObj.searchParams.get('link') ?? '',
      idnet: params.idnet ?? urlObj.searchParams.get('idnet') ?? '',
      geo: params.geo ?? urlObj.searchParams.get('geo') ?? ''
    };

    try {
      const result = await fetchToffersOffers({
        type,
        start,
        length,
        draw,
        cookie,
        filters
      });
      respondWithJson(response, 200, result);
    } catch (err) {
      respondWithJson(response, 500, {
        success: false,
        error: err.message,
        code: err.code || 'UNKNOWN_ERROR',
        type
      });
    }
    return true;
  }
  return false;
}
