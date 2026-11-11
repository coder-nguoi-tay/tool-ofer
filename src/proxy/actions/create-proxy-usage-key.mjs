import { createHash } from 'node:crypto';
import { proxyIdentity } from '../../runtime/actions/proxy-identity.mjs';
import { safeNormalizeUrl } from '../configuration.mjs';

/**
 * Sinh khóa ổn định cho proxy, giữ các dòng trùng nhau thành mục lịch sử riêng.
 *
 * @param {object} proxy Cấu hình proxy đã phân tích.
 * @param {number} occurrence Thứ tự xuất hiện của cấu hình giống hệt trong danh sách.
 * @param {string} [websiteUrl=''] URL trang đích tương ứng nếu có.
 * @return {string} Khóa băm không chứa thông tin đăng nhập dạng rõ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function createProxyUsageKey(proxy, occurrence, websiteUrl = '') {
  const normUrl = websiteUrl ? safeNormalizeUrl(websiteUrl) : '';
  const identity = normUrl ? `${proxyIdentity(proxy)}|${normUrl}` : proxyIdentity(proxy);
  const proxyHash = createHash('sha256').update(identity).digest('hex');
  return `${proxyHash}:${occurrence}`;
}
