import { proxyIdentity } from '../../runtime/actions/proxy-identity.mjs';

/**
 * Khóa duy nhất đại diện cho proxy trong hàng đợi và lịch sử dùng:
 * Ưu tiên _queueLine gốc (chứa đầy đủ session, pass, port), fallback về proxyIdentity.
 *
 * @param {object|null} proxy Đối tượng proxy.
 * @return {string} Khóa định danh duy nhất.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function getProxyUniqueKey(proxy) {
  if (!proxy) return '';
  if (proxy._queueLine) return proxy._queueLine;
  return proxyIdentity(proxy);
}
