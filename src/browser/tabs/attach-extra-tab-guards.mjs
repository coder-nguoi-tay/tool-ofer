import { protectConfirmedLeadSession } from '../../leads/actions/protect-confirmed-lead-session.mjs';
import { getDeadOrBlockedReason } from '../../leads/page-health/get-dead-or-blocked-reason.mjs';

// Tab quảng cáo rác hay bật ra khi nhảy trang (cửa hàng ứng dụng, mạng quảng cáo popup).
const SPAM_AD_TAB_PATTERN = /galaxystore\.samsung\.com|play\.google\.com\/store|apps\.apple\.com|popads|propellerads|clickadu|trafficjunky|zeroredirect|doubleclick\.net|syndication\.exoclick/i;

/**
 * Canh tab mới ngoài luồng (dùng chung Chrome và GoLogin): tab quảng cáo rác thì đóng và quay về tab đầu; tab phụ lỗi
 * mạng thì chỉ đóng tab đó, không đóng cả trình duyệt. Tab offer mở sang tab mới không bị đóng (watchTrafficBlockedPage
 * kiểm tra trang không phải offer; limitOfferTabs giới hạn số tab). Phiên đã có lead thì không đụng tới.
 * @param {object} context Context trình duyệt của phiên.
 * @param {object} session Phiên đang chạy (mainPage, addBrowserLog).
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export function attachExtraTabGuards(context, session) {
  const isOwnTab = page => protectConfirmedLeadSession(session) || page.isClosed() || page === session.mainPage || page._uxOriginTab;
  context.on('page', newPage => {
    setTimeout(async () => {
      if (isOwnTab(newPage)) return;
      try {
        if (newPage._tabIndex !== undefined || newPage._uxPlanned) return;
        const url = newPage.url();
        if (!url || url.startsWith('about:')) return;
        if (SPAM_AD_TAB_PATTERN.test(url)) {
          newPage._uxClosedByApp = 'tab quảng cáo rác';
          console.log(`[PopupTab] Tab quảng cáo ngoài luồng (${url}), đóng và quay về tab đầu.`);
          session.addBrowserLog?.({ type: 'popup_closed', url, title: '[Đóng tab nhảy trang]', html: '' });
          await newPage.close().catch(() => {});
        }
        const first = context.pages().filter(page => !page.isClosed())[0];
        if (first) await first.bringToFront().catch(() => {});
      } catch {}
    }, 3000);
    newPage.on('load', async () => {
      if (isOwnTab(newPage)) return;
      try {
        const deadReason = await getDeadOrBlockedReason(newPage);
        if (!deadReason || protectConfirmedLeadSession(session)) return;
        console.log(`[DeadTab] Tab lỗi "${deadReason}" (${newPage.url()}), đóng và giữ trình duyệt.`);
        session.addBrowserLog?.({ type: 'traffic_blocked', detail: `Tab lỗi: ${deadReason}` });
        await newPage.close().catch(() => {});
        const remaining = context.pages().filter(page => !page.isClosed());
        if (remaining.length > 0) await (session.mainPage?.isClosed?.() ? remaining[0] : session.mainPage).bringToFront().catch(() => {});
      } catch {}
    });
  });
}
