import { URL } from 'node:url';
import { isIP } from 'node:net';

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
  // IPv6 trong URL/kèm cổng viết trong ngoặc vuông: [2603:…]:8080 → 2603:…
  const bracketed = cleaned.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) cleaned = bracketed[1];
  // IPv6 chứa nhiều dấu ":" nên không được cắt như host:port (lỗi cũ biến 2603:300b:… thành "2603",
  // gộp mọi IPv6 cùng tiền tố thành một IP khi khoá trùng và kiểm lead). Chữ hoa/thường là cùng một địa chỉ.
  if (isIP(cleaned) === 6) return cleaned.toLowerCase();
  if (cleaned.includes(':') && !cleaned.includes('::')) {
    cleaned = cleaned.split(':')[0];
  }
  return cleaned.trim();
}
export { normalizeIpAddress };
