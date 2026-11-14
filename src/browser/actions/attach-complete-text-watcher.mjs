import { applicationState } from '../../runtime/application-state.mjs';
import { protectConfirmedLeadSession } from '../../leads/actions/protect-confirmed-lead-session.mjs';

/**
 * Ô "Complete text": thấy chuỗi hoàn tất trên trang chính thì tăng bộ đếm Giới hạn (limitRun) và đóng phiên để bù slot.
 * Không đóng phiên đã có lead. Dùng chung cho Chrome và GoLogin.
 * @param {object} session Phiên đang chạy (addLog/addBrowserLog, browser).
 * @param {object} page Tab chính cần dò chuỗi.
 * @param {string} completeText Chuỗi hoàn tất người dùng nhập; rỗng thì không làm gì.
 * @param {Function} [closeBrowser] Cách đóng phiên của engine.
 * @return {Function} Huỷ dò chuỗi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export function attachCompleteTextWatcher(session, page, completeText, closeBrowser = () => session.browser?.close?.()) {
  if (!completeText || !page) return () => {};
  const needle = String(completeText).toLowerCase();
  const timer = setInterval(async () => {
    if (page.isClosed()) {
      clearInterval(timer);
      return;
    }
    const found = await page.evaluate(n => (document.body?.innerText || '').toLowerCase().includes(n), needle).catch(() => false);
    if (!found) return;
    clearInterval(timer);
    applicationState.limitRunCount += 1;
    const entry = {
      time: new Date().toISOString(),
      type: 'complete_text',
      detail: `Đã tìm thấy text hoàn tất "${completeText}" (${applicationState.limitRunCount}${applicationState.limitRunMax > 0 ? '/' + applicationState.limitRunMax : ''}).`
    };
    (session.addLog || session.addBrowserLog)?.(entry);
    if (protectConfirmedLeadSession(session)) return;
    session.suppressAutoRefill = false;
    await Promise.resolve(closeBrowser()).catch(() => {});
  }, 2000);
  return () => clearInterval(timer);
}
