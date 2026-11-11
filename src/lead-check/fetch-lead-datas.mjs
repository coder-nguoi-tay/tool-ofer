import { DEFAULT_LEAD_CONFIG } from './state/default-lead-config.mjs';
import { LeadApiError } from './lead-api-error.mjs';
import { URL } from 'node:url';

/**
 * Sử dụng redirect: 'manual' để phát hiện chính xác khi Cookie xác thực hết hạn (bị chuyển hướng về trang đăng nhập)
 * và kiểm tra nghiêm ngặt tính toàn vẹn của phản hồi JSON.
 *
 * @param {object} [config={}] Cấu hình URL, Cookie và datas.
 * @return {Promise<object>} Dữ liệu JSON phản hồi từ API có chứa mảng results.
 * @throws {LeadApiError} Khi cookie hết hạn, mạng lỗi, hoặc server trả định dạng bất thường.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function fetchLeadDatas(config = {}) {
  const apiUrl = config.apiUrl || DEFAULT_LEAD_CONFIG.apiUrl;
  const cookie = config.cookie || DEFAULT_LEAD_CONFIG.cookie;
  const datas = config.datas || DEFAULT_LEAD_CONFIG.datas;
  let response;
  try {
    const urlObj = new URL(apiUrl);
    const origin = urlObj.origin;
    const referer = apiUrl.replace(/\/get_lead_datas\/?$/, '');
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Cookie': cookie,
        'accept': 'application/json, text/javascript, */*; q=0.01',
        'accept-language': 'vi-VN,vi;q=0.7',
        'cache-control': 'no-cache',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'origin': origin,
        'pragma': 'no-cache',
        'referer': referer,
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
      body: `datas=${encodeURIComponent(datas)}`,
      signal: AbortSignal.timeout(15_000),
      redirect: 'manual' // Chặn tự động chuyển hướng để bắt mã 302 khi Cookie hết hạn
    });
  } catch (err) {
    throw new LeadApiError(`Không thể kết nối tới API kiểm tra lead (${err.message})`, 'NETWORK_ERROR', {
      originalError: err.message
    });
  }

  // Nếu bị 301, 302, 303 hoặc 401, 403: phiên đăng nhập đã hết hạn và chuyển về login.html
  if ([301, 302, 303, 307, 308].includes(response.status) || response.status === 401 || response.status === 403) {
    const location = response.headers.get('location') || '';
    throw new LeadApiError(`Cookie xác thực hết hạn hoặc chưa đăng nhập (HTTP ${response.status} -> ${location || 'login'})`, 'AUTH_EXPIRED', {
      status: response.status,
      location
    });
  }
  if (!response.ok) {
    throw new LeadApiError(`Lead API trả mã lỗi HTTP ${response.status}`, 'SERVER_ERROR', {
      status: response.status
    });
  }
  let text = '';
  try {
    text = await response.text();
  } catch (err) {
    throw new LeadApiError(`Không đọc được nội dung từ API (${err.message})`, 'NETWORK_ERROR');
  }

  // Nếu server trả về HTML thay vì JSON (trang lỗi Cloudflare hoặc trang login không redirect)
  if (text.trim().startsWith('<') || text.includes('<!DOCTYPE') || text.includes('<html')) {
    throw new LeadApiError('API toffers.top trả về HTML thay vì dữ liệu JSON (có thể bị Cloudflare chặn hoặc phiên hết hạn)', 'INVALID_RESPONSE', {
      preview: text.slice(0, 120)
    });
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new LeadApiError(`Dữ liệu phản hồi không phải định dạng JSON: ${err.message}`, 'INVALID_RESPONSE', {
      preview: text.slice(0, 120)
    });
  }
  if (!data || !Array.isArray(data.results)) {
    throw new LeadApiError('Dữ liệu phản hồi thiếu mảng danh sách "results"', 'INVALID_RESPONSE', {
      data
    });
  }
  return data;
}
export { fetchLeadDatas };
