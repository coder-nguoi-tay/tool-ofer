import { activeBrowsers } from '../../browser/sessions.mjs';
import { activeProxyLocks } from '../../runtime/constants/active-proxy-locks.mjs';
import { proxyIdentity } from '../../runtime/actions/proxy-identity.mjs';

/**
 * Kiểm tra xem một proxy có đang được sử dụng ở bất kỳ cửa sổ nào không.
 *
 * @param {object|null} proxy Đối tượng proxy cần kiểm tra.
 * @return {boolean} True nếu proxy đang bận.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function isProxyCurrentlyActive(proxy) {
  if (!proxy) return false;
  if (!proxy.server) return false;
  const identity = proxyIdentity(proxy);
  if (activeProxyLocks.has(identity)) return true;
  for (const session of activeBrowsers) {
    if (session.proxy?.server && proxyIdentity(session.proxy) === identity) return true;
  }
  return false;
}
