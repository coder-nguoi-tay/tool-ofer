import { requestProxyIpInfo } from '../proxy/actions/request-proxy-ip-info.mjs';
import { browserGeoCheckUrl } from '../runtime/constants/browser-ip-check-urls.mjs';
import { localeForCountry } from '../stealth/locale-for-country.mjs';

/**
 * Tra múi giờ, toạ độ và ngôn ngữ của IP proxy trước, để SDK GoLogin không phải tự tra lại qua proxy lúc khởi động
 * (khoảng 1 giây mỗi phiên, có lúc tới 6 giây khi chạy nhiều phiên song song).
 * @param {object} proxy Proxy đã phân tích (server, username, password).
 * @param {Function} [request=requestProxyIpInfo] Hàm tra qua proxy, thay bằng mock khi test.
 * @return {Promise<{ip: string, country: string, timezone: string, ll: number[], accuracy: number, languages: string}|null>}
 *   Dữ liệu dạng SDK cần cho tuỳ chọn timezone; null khi proxy không trả được múi giờ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export async function fetchProxyGeo(proxy, request = requestProxyIpInfo) {
  return toSdkGeo(await request(proxy, browserGeoCheckUrl).catch(() => null));
}

/**
 * Chuẩn hoá về dạng SDK GoLogin cần. geo.myip.link trả đủ; khi dịch vụ đó lỗi (vd. chặn IP), requestProxyIpInfo rơi về
 * ip-api (timezone + loc, không có languages/ll) thì dựng đủ từ quốc gia, để SDK không tự tra lại rồi báo "Proxy Error".
 * @param {object|null} data Phản hồi tra IP.
 * @return {object|null} Geo dạng SDK hoặc null khi thiếu IP/múi giờ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
function toSdkGeo(data) {
  if (!data?.ip || typeof data.timezone !== 'string' || !data.timezone.includes('/')) return null;
  const ll = Array.isArray(data.ll) ? data.ll.map(Number) : String(data.loc || '').split(',').map(Number);
  if (ll.length !== 2 || ll.some(Number.isNaN)) return null;
  const languages = typeof data.languages === 'string' && data.languages ? data.languages : localeForCountry(data.country).locale.split('-')[0];
  return { ...data, ll, accuracy: Number(data.accuracy) || 100, languages };
}
