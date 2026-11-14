import { browserIpCheckUrls, browserGeoCheckUrl } from '../../runtime/constants/browser-ip-check-urls.mjs';
import { normalizeIpAddress } from '../../lead-check/normalize-ip-address.mjs';

/**
 * Chỉ cho mở offer khi IP đọc trong Orbita khớp đúng IP proxy đã khóa cho slot.
 * @param {object} context Context Orbita đã kết nối.
 * @param {string} expectedIp IP được launcher kiểm tra và giữ chỗ.
 * @param {Function} [onClientHints] Nhận Client Hints gốc của Orbita đọc trên trang https này (kể cả khi IP lệch).
 * @param {Function} [onGeo] Nhận múi giờ/toạ độ/quốc gia của chính IP đọc được (null khi chỉ đọc được qua dịch vụ IP dự phòng).
 * @return {Promise<string>} IP đã xác minh trong browser.
 * @throws {Error} Khi không đọc được IP hoặc profile dùng sai proxy.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export async function verifyGoLoginProfileIp(context, expectedIp, onClientHints = () => {}, onGeo = () => {}) {
  const page = await context.newPage();
  try {
    // geo.myip.link trước: IP và múi giờ/toạ độ đến từ cùng một kết nối của Orbita, tức đúng IP app hiển thị.
    for (const url of [browserGeoCheckUrl, ...browserIpCheckUrls]) {
      let ip = null, geo = null;
      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 });
        if (!response?.ok()) continue;
        const text = await page.locator('body').innerText({ timeout: 5000 });
        try {
          const data = JSON.parse(text);
          ip = normalizeIpAddress(data.ip);
          if (ip && typeof data.timezone === 'string' && Array.isArray(data.ll)) geo = { ...data, ip };
        }
        catch { ip = normalizeIpAddress(text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/)?.[0]); }
      } catch { continue; }
      if (!ip) continue;
      let clientHints = null;
      try { clientHints = await page.evaluate(() => navigator.userAgentData?.getHighEntropyValues(['architecture', 'bitness', 'model', 'platformVersion', 'uaFullVersion', 'fullVersionList', 'wow64']) ?? null); } catch {}
      onClientHints(clientHints);
      onGeo(geo);
      if (ip !== expectedIp) throw Object.assign(new Error('IP trong Orbita khác IP proxy đã cấp; dừng trước khi mở offer.'), { code: 'GOLOGIN_IP_MISMATCH', detectedIp: ip, expectedIp });
      return ip;
    }
    throw Object.assign(new Error('Không xác minh được IP trong Orbita; không mở offer.'), { code: 'GOLOGIN_IP_UNAVAILABLE' });
  } finally { await page.close().catch(() => {}); }
}
