import { requestProxyIpInfo } from './request-proxy-ip-info.mjs';

// ponytail: cache 10 phút cho cả app; IP nhà mạng của Mac hiếm khi đổi trong lúc chạy, cần thì giảm thời gian cache.
const CACHE_MS = 10 * 60_000;
let cached = { ip: null, at: 0 };
let lookupOverride = null;

/**
 * Thay cách tra IP Mac (chỉ dùng trong test để không gọi Internet).
 * @param {Function|null} lookup Hàm trả IP; null để dùng lại tra thật.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export function setMacPublicIpLookup(lookup) {
  lookupOverride = lookup;
  cached = { ip: null, at: 0 };
}

/**
 * IP public thật của máy Mac (tra trực tiếp, không qua proxy), có cache.
 * @return {Promise<string|null>} IP hoặc null khi không tra được (khi đó không chặn phiên chỉ vì thiếu dữ liệu).
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export async function getMacPublicIp() {
  if (lookupOverride) return lookupOverride();
  if (cached.ip && Date.now() - cached.at < CACHE_MS) return cached.ip;
  try {
    const info = await requestProxyIpInfo(null);
    if (typeof info?.ip === 'string') cached = { ip: info.ip, at: Date.now() };
  } catch {}
  return cached.ip;
}

/**
 * Chặn mở offer khi IP trình duyệt thấy là IP thật của Mac (proxy hỏng/cấu hình sai/proxy trong suốt).
 * @param {string|null} exitIp IP đọc được trong trình duyệt.
 * @param {Function} [lookup=getMacPublicIp] Hàm tra IP Mac, thay bằng mock khi test.
 * @return {Promise<void>}
 * @throws {Error} Mã MAC_IP_EXPOSED khi trình duyệt đang ra Internet bằng IP thật của Mac.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export async function assertNotMacPublicIp(exitIp, lookup = getMacPublicIp) {
  if (!exitIp) return;
  const macIp = await lookup();
  if (macIp && macIp === exitIp) {
    throw Object.assign(new Error(`Trình duyệt đang ra Internet bằng IP thật của máy Mac (${exitIp}); dừng phiên, không mở offer.`), { code: 'MAC_IP_EXPOSED' });
  }
}
