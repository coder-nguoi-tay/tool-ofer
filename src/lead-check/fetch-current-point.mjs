import { DEFAULT_LEAD_CONFIG } from './state/default-lead-config.mjs';
import { LeadApiError } from './lead-api-error.mjs';

/**
 * Gọi API toffers.top để lấy số point hiện tại.
 *
 * @param {object} [config={}] Cấu hình Cookie hoặc pointUrl.
 * @return {Promise<{point: number|string}>} Số point hiện tại.
 * @throws {LeadApiError} Khi cookie hết hạn hoặc server lỗi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function fetchCurrentPoint(config = {}) {
  const pointUrl = config.pointUrl || DEFAULT_LEAD_CONFIG.pointUrl || 'https://toffers.top/partner/get_data_not/get_current_point';
  const cookie = config.cookie || DEFAULT_LEAD_CONFIG.cookie;
  let response;
  try {
    response = await fetch(pointUrl, {
      method: 'POST',
      headers: {
        'Cookie': cookie,
        'accept': 'application/json, text/javascript, */*; q=0.01',
        'accept-language': 'vi-VN,vi;q=0.6',
        'cache-control': 'no-cache',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'origin': 'https://toffers.top',
        'pragma': 'no-cache',
        'referer': 'https://toffers.top/partner/chat_leading',
        'sec-ch-ua': '"Brave";v="155", "Chromium";v="155", "Not(A:Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'sec-gpc': '1',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
        'x-requested-with': 'XMLHttpRequest'
      },
      body: 'datas=%22%22',
      signal: AbortSignal.timeout(10_000),
      redirect: 'manual'
    });
  } catch (err) {
    throw new LeadApiError(`Không thể kết nối tới API lấy số point (${err.message})`, 'NETWORK_ERROR', {
      originalError: err.message
    });
  }
  if ([301, 302, 303, 307, 308].includes(response.status) || response.status === 401 || response.status === 403) {
    const location = response.headers.get('location') || '';
    throw new LeadApiError(`Cookie xác thực hết hạn khi lấy số point (${response.status} -> ${location || 'login'})`, 'AUTH_EXPIRED', {
      status: response.status,
      location
    });
  }
  if (!response.ok) {
    throw new LeadApiError(`API Point trả mã lỗi HTTP ${response.status}`, 'SERVER_ERROR');
  }
  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    return {
      point: parsed.point !== undefined ? parsed.point : null
    };
  } catch {
    return {
      point: text.trim()
    };
  }
}
export { fetchCurrentPoint };
