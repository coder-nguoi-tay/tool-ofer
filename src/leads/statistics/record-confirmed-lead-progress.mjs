import { saveAndRecordLeadIpStats } from './save-and-record-lead-ip-stats.mjs';

/**
 * Sau khi IP đã có lead: ghi tiến độ (màn đang làm, số lần nhảy trang) vào thống kê lead để tab Toffers hiện cột tiến độ.
 * Dùng chung cho Chrome và GoLogin (callback onScreenAdvanced/onPageJump của autofill).
 * @param {object} session Phiên đang chạy.
 * @param {number} jumps Số lần nhảy trang hiện tại.
 * @param {number} [screen] Màn hiện tại; thiếu thì lấy màn xa nhất phiên đã tới.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export function recordConfirmedLeadProgress(session, jumps, screen) {
  if (session.leadCheckStatus !== 'confirmed' || !session.exitIp) return;
  saveAndRecordLeadIpStats({
    ip: session.exitIp,
    screen: screen ?? Math.max(session.screenReached || 1, session.currentScreen || 1, (session.completedScreens || 0) + 1),
    completedScreens: session.completedScreens || 0,
    jumpCount: jumps,
    offerNumber: session.offerNumber ?? session.streamRole ?? 1,
    proxy: session.proxyServer || session.proxyKey,
    websiteUrl: session.websiteUrl
  });
}
