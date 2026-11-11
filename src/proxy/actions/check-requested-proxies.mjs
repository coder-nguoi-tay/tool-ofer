import { buildProxyCheckReport } from './build-proxy-check-report.mjs';
import { requestProxyIpInfo } from './request-proxy-ip-info.mjs';
import { selectProxies } from '../configuration.mjs';

/**
 * Kiểm tra từng proxy qua HTTPS, hỗ trợ cả SOCKS5 có xác thực và báo IP exit.
 *
 * @param {string} requestBody Nội dung JSON nhận từ giao diện.
 * @return {Promise<{results: string[], warnings: string[]}>} Kết quả từng proxy.
 * @throws {Error} Khi danh sách proxy không hợp lệ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function checkRequestedProxies(requestBody) {
  const body = JSON.parse(requestBody);
  const selectedProxies = selectProxies(body.proxyList, body.proxyType ?? 'socks5', body.requestedCount);
  const checked = await Promise.all(selectedProxies.map(async (proxy, index) => {
    try {
      const info = await requestProxyIpInfo(proxy);
      return {
        index,
        proxy,
        ip: info.ip,
        country: info.country,
        city: info.city,
        org: info.org
      };
    } catch (error) {
      return {
        index,
        proxy,
        error: error.message.split('\n')[0]
      };
    }
  }));
  return buildProxyCheckReport(checked);
}
