import { activeProxyLocks } from '../../runtime/constants/active-proxy-locks.mjs';
import { proxyIdentity } from '../../runtime/actions/proxy-identity.mjs';

/**
 * Đặt khóa độc quyền cho proxy trước khi khởi chạy trình duyệt.
 *
 * @param {object|null} proxy Đối tượng proxy.
 * @return {void} Không trả giá trị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function acquireProxyLock(proxy) {
  if (proxy?.server) activeProxyLocks.add(proxyIdentity(proxy));
}
