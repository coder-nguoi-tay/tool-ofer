import { protectConfirmedLeadSession } from './protect-confirmed-lead-session.mjs';
import { readThrottledPageHealth } from '../page-health/read-throttled-page-health.mjs';
import { resetRecoveredPageAutofill } from '../../autofill/reset-recovered-page-autofill.mjs';

const recoveries = new WeakMap();

/**
 * Giữ browser có lead và quay lại trang trước khi tab lỗi, rồi đánh thức autofill hiện có.
 * Mỗi tab chỉ có một lượt Back; cùng URL lỗi thử tối đa ba lần, cách nhau ít nhất 15 giây.
 * @param {object} session Phiên có IP được xác nhận lead.
 * @param {object} page Tab cần kiểm tra và phục hồi.
 * @return {Promise<boolean>} True khi đã gặp lỗi và giữ tab để phục hồi/chờ xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function recoverConfirmedLeadErrorPage(session, page) {
  if (!protectConfirmedLeadSession(session) || session.isClosed || session.suppressAutoRefill || page?.isClosed?.() || typeof page?.goBack !== 'function') return false;
  const state = recoveries.get(page) || { busy: false, attempts: 0, lastAt: 0, url: '' };
  recoveries.set(page, state);
  if (state.busy || Date.now() - state.lastAt < 15_000) return false;
  state.busy = true;
  try {
    const errorUrl = page.url();
    const mainFrame = page.mainFrame?.() || page;
    const reason = page._uxMainStatus >= 400 ? 'Lỗi HTTP của trang' : await readThrottledPageHealth(mainFrame);
    if (!reason || !protectConfirmedLeadSession(session) || page.isClosed?.() || page.url() !== errorUrl) return false;
    if (state.url !== errorUrl) Object.assign(state, { url: errorUrl, attempts: 0 });
    if (state.attempts >= 3) return true;
    state.attempts++;
    state.lastAt = Date.now();
    session.addBrowserLog?.({ type: 'lead_error_recovery', detail: `Giữ trình duyệt có lead, quay lại trang trước để tiếp tục form (lượt ${state.attempts}/3).` }, page);
    page._leadRecoveryInProgress = true;
    const response = await page.goBack({ waitUntil: 'domcontentloaded', timeout: 8000 });
    if (!protectConfirmedLeadSession(session) || page.isClosed?.() || session.isClosed) return true;
    page._uxHealthRevision = (page._uxHealthRevision || 0) + 1;
    mainFrame._uxHealthRevision = (mainFrame._uxHealthRevision || 0) + 1;
    page._uxMainStatus = response?.status?.() || 0;
    if (page.url() === errorUrl && !response || !/^https?:/.test(page.url()) || page._uxMainStatus >= 400 || await readThrottledPageHealth(mainFrame)) return true;
    await resetRecoveredPageAutofill(page, session);
    if (protectConfirmedLeadSession(session) && !session.isClosed && !page.isClosed?.()) {
      page._leadRecoveryInProgress = false;
      if (typeof page.triggerAutofillScan === 'function') page.triggerAutofillScan();
      else session.triggerAutofillScan?.();
      session.addBrowserLog?.({ type: 'lead_error_recovered', detail: 'Đã trở lại trang trước; tiếp tục trả lời/điền form theo dữ liệu của phiên.' }, page);
    }
    return true;
  } catch {
    session.addBrowserLog?.({ type: 'lead_recovery_waiting', detail: 'Chưa quay lại được trang trước; giữ trình duyệt có lead mở và chờ lượt phục hồi tiếp theo.' }, page);
    return true;
  } finally { page._leadRecoveryInProgress = false; state.busy = false; }
}
