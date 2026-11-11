import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { checkUrl } from '../../runtime/constants/check-url.mjs';
import { get as requestHttp } from 'node:http';
import { get as requestHttps } from 'node:https';

/**
 * Yêu cầu ipinfo qua proxy hoặc mạng trực tiếp và trả thông tin địa chỉ IP bên ngoài.
 *
 * @param {object|null} proxy Cấu hình proxy đã phân tích; null để tra IP trực tiếp.
 * @return {Promise<object>} Thông tin JSON do ipinfo trả về.
 * @throws {Error} Khi proxy không kết nối được hoặc endpoint trả mã lỗi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function requestProxyIpInfo(proxy = null) {
  let agent;
  if (proxy) {
    const proxyUrl = new URL(proxy.server);
    if (proxy.username) proxyUrl.username = proxy.username;
    if (proxy.password) proxyUrl.password = proxy.password;
    agent = proxyUrl.protocol === 'socks5:' ? new SocksProxyAgent(proxyUrl) : new HttpsProxyAgent(proxyUrl);
  }
  const fetchJson = (urlStr, timeoutMs = 4000) => new Promise((resolve, reject) => {
    const isHttps = urlStr.startsWith('https:');
    const reqFn = isHttps ? requestHttps : requestHttp;
    const proxyRequest = reqFn(urlStr, {
      ...(agent ? {
        agent
      } : {}),
      timeout: timeoutMs
    }, response => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        responseBody += chunk;
      });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          const authHint = response.statusCode === 407 ? ' — proxy từ chối xác thực user/password.' : '';
          reject(new Error(`HTTP ${response.statusCode}${authHint}`));
          return;
        }
        try {
          resolve(JSON.parse(responseBody));
        } catch {
          reject(new Error('Dịch vụ kiểm tra IP trả về dữ liệu không hợp lệ.'));
        }
      });
    });
    proxyRequest.on('timeout', () => proxyRequest.destroy(new Error(`Timeout tra IP sau ${timeoutMs}ms.`)));
    proxyRequest.on('error', reject);
  });
  return fetchJson(checkUrl, 4000).catch(async () => {
    // Fallback qua ip-api.com khi ipinfo.io bị quá tải hoặc lỗi
    const ipApi = await fetchJson('http://ip-api.com/json', 5000);
    return {
      ip: ipApi.query,
      country: ipApi.countryCode,
      city: ipApi.city,
      region: ipApi.regionName,
      timezone: ipApi.timezone,
      loc: `${ipApi.lat},${ipApi.lon}`
    };
  });
}
