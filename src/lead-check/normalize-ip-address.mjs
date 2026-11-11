import { URL } from 'node:url';

/**
 * Chuẩn hóa địa chỉ IP: loại bỏ khoảng trắng và cổng (nếu có).
 *
 * @param {string|null|undefined} ip Địa chỉ IP thô.
 * @return {string} Địa chỉ IP đã chuẩn hóa.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function normalizeIpAddress(ip) {
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
export { normalizeIpAddress };
