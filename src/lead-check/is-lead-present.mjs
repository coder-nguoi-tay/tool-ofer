import { normalizeIpAddress } from './normalize-ip-address.mjs';

/**
 * Kiểm tra xem IP mục tiêu có xuất hiện trong dữ liệu lead trả về từ API hay không.
 *
 * Hỗ trợ cả dữ liệu dạng đối tượng JSON (results array) lẫn chuỗi thô JSON/HTML.
 *
 * @param {object|string|null|undefined} responseData Dữ liệu trả về từ API.
 * @param {string|string[]} targetIps Địa chỉ IP hoặc danh sách IP cần đối chiếu (exitIp, proxyHost).
 * @return {boolean} True nếu tìm thấy IP trong dữ liệu lead.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function isLeadPresent(responseData, targetIps) {
  if (!responseData || !targetIps) return false;
  const rawList = Array.isArray(targetIps) ? targetIps : [targetIps];
  const normalizedTargets = rawList.map(normalizeIpAddress).filter(Boolean);
  if (!normalizedTargets.length) return false;

  // 1. Đối tượng JSON có trường results
  if (typeof responseData === 'object' && responseData !== null) {
    const records = Array.isArray(responseData.results) ? responseData.results : Array.isArray(responseData) ? responseData : [];
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
export { isLeadPresent };
