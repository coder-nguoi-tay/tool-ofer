import { leadIpStatsMap } from './state/lead-ip-stats-map.mjs';
import { normalizeIpAddress } from './normalize-ip-address.mjs';

/**
 * Ghi nhận hoặc cập nhật tiến trình (số màn và số lần nhảy trang) cho IP có lead.
 * Tự động giữ giá trị số màn và số lần nhảy trang cao nhất (Math.max).
 *
 * @param {object} entry Thông tin IP và tiến trình.
 * @param {string} entry.ip Địa chỉ IP.
 * @param {number} [entry.screen=1] Số màn mà IP đã làm đến (ví dụ Màn 20).
 * @param {number} [entry.completedScreens=0] Số màn đã hoàn tất.
 * @param {number} [entry.jumpCount=0] Số lần đã nhảy trang (ví dụ nhảy 20 lần).
 * @param {number} [entry.offerNumber=1] Số thứ tự Offer.
 * @param {string} [entry.offerName=''] Tên Offer.
 * @param {string} [entry.proxy=''] Địa chỉ Proxy.
 * @param {string} [entry.websiteUrl=''] URL trang web.
 * @param {string} [entry.confirmedAt] Thời gian xác nhận có lead lần đầu.
 * @param {number} [entry.leadAttempt=1] Lần kiểm tra phát hiện có lead.
 * @return {object|null} Bản ghi đã được cập nhật.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function recordLeadIpStats(entry) {
  if (!entry || !entry.ip) return null;
  const ip = normalizeIpAddress(entry.ip);
  if (!ip) return null;
  const existing = leadIpStatsMap.get(ip) || {};
  const currentScreen = Math.max(existing.screen || 1, Number(entry.screen) || 1);
  const completedScreens = Math.max(existing.completedScreens || 0, Number(entry.completedScreens) || 0);
  const jumpCount = Math.max(existing.jumpCount || 0, Number(entry.jumpCount) || 0);
  const updated = {
    ip,
    screen: currentScreen,
    completedScreens,
    jumpCount,
    offerNumber: entry.offerNumber ?? existing.offerNumber ?? 1,
    offerName: entry.offerName || existing.offerName || '',
    proxy: entry.proxy || existing.proxy || '',
    websiteUrl: entry.websiteUrl || existing.websiteUrl || '',
    confirmedAt: existing.confirmedAt || entry.confirmedAt || new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    leadAttempt: entry.leadAttempt || existing.leadAttempt || 1,
    details: `Đã làm đến Màn ${currentScreen}, đã nhảy trang ${jumpCount} lần.`
  };
  leadIpStatsMap.set(ip, updated);
  return updated;
}
export { recordLeadIpStats };
