import { URL } from 'node:url';

/**
 * Cấu hình mặc định cho việc kiểm tra lead qua API toffers.top.
 *
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
export const DEFAULT_LEAD_CONFIG = {
  enabled: true,
  apiUrl: 'https://toffers.top/partner/chat_leading/get_lead_datas',
  cookie: 'qcodes_=7p0d1pg081d433i45giksp7k5fvm386o; qcodes_sound=1',
  datas: '1504',
  intervalSeconds: 30,
  maxAttempts: 2,
};

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
 * @param {object} [config={}] Cấu hình URL, Cookie và datas.
 * @return {Promise<object>} Dữ liệu JSON phản hồi từ API.
 * @throws {Error} Khi kết nối thất bại hoặc HTTP status khác 2xx.
 */
export async function fetchLeadDatas(config = {}) {
  const apiUrl = config.apiUrl || DEFAULT_LEAD_CONFIG.apiUrl;
  const cookie = config.cookie || DEFAULT_LEAD_CONFIG.cookie;
  const datas = config.datas || DEFAULT_LEAD_CONFIG.datas;

  const urlObj = new URL(apiUrl);
  const origin = urlObj.origin;
  const referer = apiUrl.replace(/\/get_lead_datas\/?$/, '');

  const response = await fetch(apiUrl, {
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
  });

  if (!response.ok) {
    throw new Error(`Lead API trả HTTP ${response.status}`);
  }
  return await response.json();
}
