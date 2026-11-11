import { activeExitIpLocks } from '../../runtime/constants/active-exit-ip-locks.mjs';
import { activeProxyLocks } from '../../runtime/constants/active-proxy-locks.mjs';
import { proxyIdentity } from '../../runtime/actions/proxy-identity.mjs';

/**
 * Giải phóng khóa độc quyền cho proxy và IP khi phiên kết thúc hoặc lỗi.
 *
 * @param {object|null} proxy Đối tượng proxy.
 * @param {string|null} exitIp Địa chỉ IP exit (nếu có).
 * @return {void} Không trả giá trị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function releaseProxyLock(proxy, exitIp = null) {
  if (proxy?.server) activeProxyLocks.delete(proxyIdentity(proxy));
  if (exitIp) activeExitIpLocks.delete(exitIp);
}
