import { requestProxyIpInfo } from './request-proxy-ip-info.mjs';

/**
 * Kiểm tra IP exit của proxy trước khi cấp profile AdsPower.
 *
 * @param {object} proxyObj Proxy HTTP hoặc SOCKS5 đã phân tích.
 * @return {Promise<string|null>} IP exit hoặc null nếu proxy không hoạt động.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function checkProxyExitIp(proxyObj) {
  if (!proxyObj || !proxyObj.server) return null;
  try {
    const info = await requestProxyIpInfo(proxyObj);
    return typeof info.ip === 'string' && /^\d{1,3}(\.\d{1,3}){3}$/.test(info.ip) ? info.ip : null;
  } catch {}
  return null;
}
