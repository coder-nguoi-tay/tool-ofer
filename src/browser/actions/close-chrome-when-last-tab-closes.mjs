import { activeBrowsers } from '../sessions.mjs';
import { autoRefill } from '../../runtime/constants/auto-refill.mjs';
import { protectConfirmedLeadSession } from '../../leads/actions/protect-confirmed-lead-session.mjs';
import { queueAutomaticRefill } from '../../refill/actions/queue-automatic-refill.mjs';
import { prepareManualBrowserClose } from './prepare-manual-browser-close.mjs';

/**
 * Theo dõi tab cuối: nút X của luồng không check lead được bù khi tự bù đang bật.
 *
 * @param {object} session Phiên Chrome cần theo dõi các tab.
 * @return {void} Đăng ký theo dõi thao tác đóng tab cuối.
 * @throws {never} Đăng ký callback đóng tab không thực thi thao tác trình duyệt.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function closeChromeWhenLastTabCloses(session) {
  const watchedPages = new WeakSet();

  /**
   * Đóng phiên khi tab cuối đã đóng và áp dụng đúng chính sách bù theo check lead.
   *
   * @param {object} [closedPage] Tab vừa đóng.
   * @return {Promise<void>} Kết thúc sau khi đóng phiên hoặc bỏ qua nếu còn tab.
   * @throws {never} Lỗi khi đóng phiên được xử lý tại callback.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-11
   */
  async function closeEmptyChromeSession(closedPage) {
    if (session.suppressAutoRefill || session.isClosed || session.closingDueToTrafficBlocked || session.closingDueToNoLead || session.leadCheckStatus === 'failed') return;
    try {
      for (const page of session.browser.pages()) {
        if (!page.isClosed()) return;
      }
      const isChromeError = Boolean(closedPage?.url?.()?.startsWith('chrome-error://') || session.mainPage?.url?.()?.startsWith('chrome-error://'));
      const closedByUser = session.isWindowVisible !== false && !session.trueHeadless && !closedPage?._uxClosedByApp && !isChromeError;

      const leadProtected = protectConfirmedLeadSession(session);
      if (!closedByUser && leadProtected) {
        session.mainPage = await session.browser.newPage();
        session.addBrowserLog?.({
          type: 'lead_browser_kept_open',
          detail: `IP ${session.exitIp} đã có lead; giữ trình duyệt và tạo tab thay cho tab tự đóng.`
        });
        return;
      }

      const slotNum = session.slot ?? (session.tileIndex ?? 0) + 1;
      const refillAfterManualClose = closedByUser && prepareManualBrowserClose(session);
      if (refillAfterManualClose) {
        session.isClosed = true;
        activeBrowsers.delete(session);
        await session.browser.close().catch(() => {});
        queueAutomaticRefill();
        return;
      }
      if (!closedByUser) {
        const reason = closedPage?._uxClosedByApp || (session.isWindowVisible !== false ? 'trang tự đóng (window.close)' : 'trang tự đóng khi đang chạy ngầm');
        console.log(`[LastTab] Slot ${slotNum}: tab cuối bị đóng tự động (${reason}); tắt trình duyệt và bù slot mới.`);
        session.addBrowserLog?.({
          type: 'last_tab_closed_auto',
          detail: `Tab cuối bị đóng tự động (${reason}); tắt trình duyệt và bù slot mới.`
        });
        session.suppressAutoRefill = false;
        session.isClosed = true;
        activeBrowsers.delete(session);
        await session.browser.close().catch(() => {});
        if (autoRefill.enabled && !autoRefill.stopRequested) {
          queueAutomaticRefill();
        }
        return;
      }

      session.suppressAutoRefill = true;
      session.isClosed = true;
      activeBrowsers.delete(session);
      await session.browser.close().catch(() => {});
    } catch {
      // Khi trình duyệt đã mất kết nối, browser close/disconnect handlers xử lý phiên.
    }
  }

  /**
   * Theo dõi tab mới để cả tab mở sau cũng được tính khi đóng phiên.
   *
   * @param {object} page Tab Chrome vừa được mở.
   * @return {void} Gắn sự kiện đóng cho tab chưa theo dõi.
   * @throws {never} Chỉ đăng ký sự kiện trên tab còn hoạt động.
   * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
   * @since 2026-10-20
   */
  function watchTab(page) {
    if (watchedPages.has(page)) return;
    watchedPages.add(page);
    page.on('close', () => closeEmptyChromeSession(page));
  }
  session.browser.on('page', watchTab);
  for (const page of session.browser.pages()) watchTab(page);
}
