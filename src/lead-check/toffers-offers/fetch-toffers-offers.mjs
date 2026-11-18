import { DEFAULT_LEAD_CONFIG } from '../state/default-lead-config.mjs';
import { LeadApiError } from '../lead-api-error.mjs';
import { parseToffersOfferRow } from './parse-toffers-offer-row.mjs';

/**
 * Lấy danh sách link offer từ toffers.top (working, new, hoặc live).
 *
 * @param {object} [options={}] Tùy chọn truy vấn.
 * @param {string} [options.type='working'] Loại danh sách: 'working', 'new', 'live'.
 * @param {number} [options.start=0] Vị trí bắt đầu.
 * @param {number} [options.length=20] Số lượng bản ghi mỗi trang.
 * @param {number} [options.draw=1] Mã draw của DataTables.
 * @param {object} [options.filters={}] Bộ lọc: { offname, id, idoffnet, agent, link, idnet, geo }.
 * @param {string} [options.cookie] Cookie xác thực toffers.
 * @param {string} [options.baseUrl='https://toffers.top'] URL gốc toffers.top.
 * @return {Promise<{success: boolean, type: string, draw: number, recordsTotal: number, recordsFiltered: number, data: Array<object>}>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
async function fetchToffersOffers(options = {}) {
  const type = ['working', 'new', 'live'].includes(options.type) ? options.type : 'working';
  const cookie = options.cookie || DEFAULT_LEAD_CONFIG.cookie;
  const baseUrl = options.baseUrl || 'https://toffers.top';
  const start = Number(options.start) || 0;
  const length = Number(options.length) || 20;
  const draw = Number(options.draw) || 1;

  const filters = {
    offname: String(options.filters?.offname || options.offname || '').trim(),
    id: String(options.filters?.id || options.id || '').trim(),
    idoffnet: String(options.filters?.idoffnet || options.idoffnet || '').trim(),
    agent: String(options.filters?.agent || options.agent || '').trim(),
    link: String(options.filters?.link || options.link || '').trim(),
    idnet: String(options.filters?.idnet || options.idnet || '').trim(),
    geo: String(options.filters?.geo || options.geo || '').trim()
  };

  const datasJson = JSON.stringify(filters);
  const url = `${baseUrl.replace(/\/+$/, '')}/partner/offers/get_offers/${type}`;

  const bodyParams = new URLSearchParams({
    draw: String(draw),
    start: String(start),
    length: String(length),
    'order[0][column]': '0',
    'order[0][dir]': 'desc',
    datas: datasJson
  });

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Cookie': cookie,
        'accept': 'application/json, text/javascript, */*; q=0.01',
        'accept-language': 'vi-VN,vi;q=0.9',
        'cache-control': 'no-cache',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'origin': baseUrl,
        'pragma': 'no-cache',
        'referer': `${baseUrl}/partner/offers/lists/working`,
        'sec-ch-ua': '"Not-A.Brand";v="99", "Brave";v="157", "Chromium";v="157"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'sec-gpc': '1',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36',
        'x-requested-with': 'XMLHttpRequest'
      },
      body: bodyParams.toString(),
      signal: AbortSignal.timeout(20_000),
      redirect: 'manual'
    });
  } catch (err) {
    throw new LeadApiError(`Không thể kết nối tới toffers get_offers/${type} (${err.message})`, 'NETWORK_ERROR');
  }

  if ([301, 302, 303, 307, 308].includes(response.status) || response.status === 401 || response.status === 403) {
    throw new LeadApiError('Cookie xác thực toffers.top hết hạn khi lấy danh sách offer', 'AUTH_EXPIRED');
  }

  if (!response.ok) {
    throw new LeadApiError(`Toffers get_offers/${type} trả mã lỗi HTTP ${response.status}`, 'SERVER_ERROR');
  }

  let text = '';
  try {
    text = await response.text();
  } catch (err) {
    throw new LeadApiError(`Lỗi đọc dữ liệu toffers get_offers: ${err.message}`, 'NETWORK_ERROR');
  }

  if (text.trim().startsWith('<') || text.includes('<!DOCTYPE') || text.includes('<html')) {
    throw new LeadApiError('Toffers trả về HTML thay vì dữ liệu JSON (phiên hết hạn hoặc bị chặn)', 'INVALID_RESPONSE');
  }

  let result;
  try {
    result = JSON.parse(text);
  } catch (err) {
    throw new LeadApiError(`Dữ liệu offer không phải JSON: ${err.message}`, 'INVALID_RESPONSE');
  }

  const recordsTotal = Number(result.recordsTotal) || 0;
  const recordsFiltered = Number(result.recordsFiltered) || 0;
  const rawRows = Array.isArray(result.data) ? result.data : [];

  const parsedData = rawRows
    .map(row => parseToffersOfferRow(row))
    .filter(Boolean);

  return {
    success: true,
    type,
    draw: Number(result.draw) || draw,
    recordsTotal,
    recordsFiltered,
    data: parsedData,
    rawCount: rawRows.length
  };
}

export { fetchToffersOffers };
