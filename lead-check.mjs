import { URL } from 'node:url';

/**
 * Cấu hình mặc định cho việc kiểm tra lead qua API toffers.top.
 *
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
export const DEFAULT_LEAD_CONFIG = {
  enabled: true,
  checkScreen: 5,
  apiUrl: 'https://toffers.top/partner/chat_leading/get_lead_datas',
  cookie: 'qcodes_=7p0d1pg081d433i45giksp7k5fvm386o; qcodes_sound=1',
  datas: '1504',
  intervalSeconds: 15,
  maxAttempts: 1,
};

/**
 * Lớp lỗi riêng cho việc gọi API kiểm tra lead, giúp phân biệt rạch ròi giữa
 * "Lỗi kết nối / Cookie hết hạn" và "API hoạt động bình thường nhưng chưa có lead".
 *
 * @extends Error
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
export class LeadApiError extends Error {
  /**
   * Khởi tạo lỗi API.
   *
   * @param {string} message Thông báo lỗi rõ ràng.
   * @param {'AUTH_EXPIRED'|'NETWORK_ERROR'|'SERVER_ERROR'|'INVALID_RESPONSE'} code Mã loại lỗi.
   * @param {object} [details={}] Chi tiết bổ sung (status, location, preview).
   */
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'LeadApiError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Chuẩn hóa địa chỉ IP: loại bỏ khoảng trắng và cổng (nếu có).
 *
 * @param {string|null|undefined} ip Địa chỉ IP thô.
 * @return {string} Địa chỉ IP đã chuẩn hóa.
 */
export function normalizeIpAddress(ip) {
  if (!ip) return '';
  let cleaned = String(ip).trim();
  if (cleaned.includes('://')) {
    try {
      cleaned = new URL(cleaned).hostname;
    } catch {
      cleaned = cleaned.split('://')[1] ?? cleaned;
    }
  }
  if (cleaned.includes(':') && !cleaned.includes('::')) {
    cleaned = cleaned.split(':')[0];
  }
  return cleaned.trim();
}

/**
 * Kiểm tra xem IP mục tiêu có xuất hiện trong dữ liệu lead trả về từ API hay không.
 *
 * Hỗ trợ cả dữ liệu dạng đối tượng JSON (results array) lẫn chuỗi thô JSON/HTML.
 *
 * @param {object|string|null|undefined} responseData Dữ liệu trả về từ API.
 * @param {string|string[]} targetIps Địa chỉ IP hoặc danh sách IP cần đối chiếu (exitIp, proxyHost).
 * @return {boolean} True nếu tìm thấy IP trong dữ liệu lead.
 */
export function isLeadPresent(responseData, targetIps) {
  if (!responseData || !targetIps) return false;
  const rawList = Array.isArray(targetIps) ? targetIps : [targetIps];
  const normalizedTargets = rawList.map(normalizeIpAddress).filter(Boolean);
  if (!normalizedTargets.length) return false;

  // 1. Đối tượng JSON có trường results
  if (typeof responseData === 'object' && responseData !== null) {
    const records = Array.isArray(responseData.results)
      ? responseData.results
      : (Array.isArray(responseData) ? responseData : []);
    for (const record of records) {
      if (record && record.ip) {
        const itemIp = normalizeIpAddress(record.ip);
        if (normalizedTargets.includes(itemIp)) return true;
      }
    }
  }

  // 2. Dạng chuỗi (JSON string hoặc plain text)
  if (typeof responseData === 'string') {
    try {
      const parsed = JSON.parse(responseData);
      return isLeadPresent(parsed, normalizedTargets);
    } catch {
      for (const target of normalizedTargets) {
        const escaped = target.replace(/\./g, '\\.');
        const pattern = new RegExp(`["']ip["']\\s*:\\s*["']${escaped}(?::\\d+)?["']`, 'i');
        if (pattern.test(responseData)) return true;
      }
    }
  }

  return false;
}

/**
 * Gọi API toffers.top để lấy danh sách lead mới nhất.
 *
 * Sử dụng redirect: 'manual' để phát hiện chính xác khi Cookie xác thực hết hạn (bị chuyển hướng về trang đăng nhập)
 * và kiểm tra nghiêm ngặt tính toàn vẹn của phản hồi JSON.
 *
 * @param {object} [config={}] Cấu hình URL, Cookie và datas.
 * @return {Promise<object>} Dữ liệu JSON phản hồi từ API có chứa mảng results.
 * @throws {LeadApiError} Khi cookie hết hạn, mạng lỗi, hoặc server trả định dạng bất thường.
 */
export async function fetchLeadDatas(config = {}) {
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
        'x-requested-with': 'XMLHttpRequest',
      },
      body: `datas=${encodeURIComponent(datas)}`,
      signal: AbortSignal.timeout(15_000),
      redirect: 'manual', // Chặn tự động chuyển hướng để bắt mã 302 khi Cookie hết hạn
    });
  } catch (err) {
    throw new LeadApiError(
      `Không thể kết nối tới API kiểm tra lead (${err.message})`,
      'NETWORK_ERROR',
      { originalError: err.message },
    );
  }

  // Nếu bị 301, 302, 303 hoặc 401, 403: phiên đăng nhập đã hết hạn và chuyển về login.html
  if ([301, 302, 303, 307, 308].includes(response.status) || response.status === 401 || response.status === 403) {
    const location = response.headers.get('location') || '';
    throw new LeadApiError(
      `Cookie xác thực hết hạn hoặc chưa đăng nhập (HTTP ${response.status} -> ${location || 'login'})`,
      'AUTH_EXPIRED',
      { status: response.status, location },
    );
  }

  if (!response.ok) {
    throw new LeadApiError(
      `Lead API trả mã lỗi HTTP ${response.status}`,
      'SERVER_ERROR',
      { status: response.status },
    );
  }

  let text = '';
  try {
    text = await response.text();
  } catch (err) {
    throw new LeadApiError(
      `Không đọc được nội dung từ API (${err.message})`,
      'NETWORK_ERROR',
    );
  }

  // Nếu server trả về HTML thay vì JSON (trang lỗi Cloudflare hoặc trang login không redirect)
  if (text.trim().startsWith('<') || text.includes('<!DOCTYPE') || text.includes('<html')) {
    throw new LeadApiError(
      'API toffers.top trả về HTML thay vì dữ liệu JSON (có thể bị Cloudflare chặn hoặc phiên hết hạn)',
      'INVALID_RESPONSE',
      { preview: text.slice(0, 120) },
    );
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new LeadApiError(
      `Dữ liệu phản hồi không phải định dạng JSON: ${err.message}`,
      'INVALID_RESPONSE',
      { preview: text.slice(0, 120) },
    );
  }

  if (!data || !Array.isArray(data.results)) {
    throw new LeadApiError(
      'Dữ liệu phản hồi thiếu mảng danh sách "results"',
      'INVALID_RESPONSE',
      { data },
    );
  }

  return data;
}
