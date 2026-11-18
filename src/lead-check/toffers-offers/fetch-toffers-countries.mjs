import { DEFAULT_LEAD_CONFIG } from '../state/default-lead-config.mjs';
import { LeadApiError } from '../lead-api-error.mjs';

/**
 * Lấy danh sách quốc gia (countries) hỗ trợ từ API toffers.top.
 *
 * @param {object} [options={}] Tùy chọn cookie hoặc baseUrl.
 * @return {Promise<Array<{id: string, text: string}>>} Danh sách quốc gia.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
async function fetchToffersCountries(options = {}) {
  const cookie = options.cookie || DEFAULT_LEAD_CONFIG.cookie;
  const baseUrl = options.baseUrl || 'https://toffers.top';
  const url = `${baseUrl.replace(/\/+$/, '')}/partner/offers/get_country`;

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
      body: 'datas=%22%22',
      signal: AbortSignal.timeout(15_000),
      redirect: 'manual'
    });
  } catch (err) {
    throw new LeadApiError(`Không thể kết nối tới toffers get_country (${err.message})`, 'NETWORK_ERROR');
  }

  if ([301, 302, 303, 307, 308].includes(response.status) || response.status === 401 || response.status === 403) {
    throw new LeadApiError('Cookie xác thực toffers.top hết hạn khi lấy danh sách quốc gia', 'AUTH_EXPIRED');
  }

  if (!response.ok) {
    throw new LeadApiError(`Toffers get_country trả mã lỗi HTTP ${response.status}`, 'SERVER_ERROR');
  }

  let text = '';
  try {
    text = await response.text();
  } catch (err) {
    throw new LeadApiError(`Lỗi đọc dữ liệu toffers get_country: ${err.message}`, 'NETWORK_ERROR');
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new LeadApiError(`Dữ liệu quốc gia trả về không phải JSON: ${err.message}`, 'INVALID_RESPONSE');
  }

  return Array.isArray(data) ? data : [];
}

export { fetchToffersCountries };
