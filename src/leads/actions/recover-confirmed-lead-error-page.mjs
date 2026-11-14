import { protectConfirmedLeadSession } from './protect-confirmed-lead-session.mjs';
import { readThrottledPageHealth } from '../page-health/read-throttled-page-health.mjs';
import { resetRecoveredPageAutofill } from '../../autofill/reset-recovered-page-autofill.mjs';

const recoveries = new WeakMap();

/**
 * Giữ browser có lead và tải lại trang bằng F5 (page.reload) khi gặp lỗi, rồi đánh thức autofill tiếp tục.
 * Tuyệt đối không tắt trình duyệt khi IP đã có lead.
 * @param {object} session Phiên có IP được xác nhận lead.
 * @param {object} page Tab cần kiểm tra và phục hồi.
 * @return {Promise<boolean>} True khi đã gặp lỗi và giữ tab để phục hồi/chờ xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function recoverConfirmedLeadErrorPage(session, page) {
  if (!protectConfirmedLeadSession(session) || session.isClosed || session.suppressAutoRefill || page?.isClosed?.()) return false;
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
    session.addBrowserLog?.({
      type: 'lead_error_recovery',
      detail: `IP đã có lead gặp trang lỗi (${reason}): giữ trình duyệt, tải lại trang bằng F5 (lượt ${state.attempts}/3).`
    }, page);
    session.updateBadge?.(`🔄 <strong>IP có lead:</strong> Đang F5 tải lại trang lỗi…`);
    console.log(`[LeadRecovery] Slot ${session.slot || '?'}: IP có lead gặp lỗi "${reason}". Giữ trình duyệt, tải lại trang bằng F5 (lần ${state.attempts}).`);

    page._leadRecoveryInProgress = true;
    let response = null;
    // 1. Ưu tiên tải lại trang bằng F5 (page.reload)
    if (typeof page.reload === 'function') {
      try {
        response = await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
      } catch {}
    }

    page._uxHealthRevision = (page._uxHealthRevision || 0) + 1;
    mainFrame._uxHealthRevision = (mainFrame._uxHealthRevision || 0) + 1;
    page._uxMainStatus = response?.status?.() || 0;

    const reloadStillDead = page.url() === errorUrl && !response ||
      !/^https?:/.test(page.url()) ||
      page._uxMainStatus >= 400 ||
      await readThrottledPageHealth(mainFrame);

    // 2. Nếu F5 vẫn lỗi và có thể quay lại trang trước: thử goBack
    if (reloadStillDead && typeof page.goBack === 'function') {
      try {
        const backResponse = await page.goBack({ waitUntil: 'domcontentloaded', timeout: 8000 });
        if (backResponse) response = backResponse;
        page._uxHealthRevision = (page._uxHealthRevision || 0) + 1;
        mainFrame._uxHealthRevision = (mainFrame._uxHealthRevision || 0) + 1;
        page._uxMainStatus = response?.status?.() || 0;
      } catch {}
    }

    if (!protectConfirmedLeadSession(session) || page.isClosed?.() || session.isClosed) return true;

    const stillDead = page.url() === errorUrl && !response ||
      !/^https?:/.test(page.url()) ||
      page._uxMainStatus >= 400 ||
      await readThrottledPageHealth(mainFrame);

    if (stillDead) {
      session.addBrowserLog?.({
        type: 'lead_recovery_waiting',
        detail: `Trang vẫn còn lỗi sau khi tải lại; giữ trình duyệt có lead mở và tiếp tục chờ phục hồi.`
      }, page);
      return true;
    }

    await resetRecoveredPageAutofill(page, session);
    if (protectConfirmedLeadSession(session) && !session.isClosed && !page.isClosed?.()) {
      page._leadRecoveryInProgress = false;
      if (typeof page.triggerAutofillScan === 'function') page.triggerAutofillScan();
      else session.triggerAutofillScan?.();
      session.addBrowserLog?.({
        type: 'lead_error_recovered',
        detail: 'Đã tải lại trang thành công; tiếp tục trả lời/điền form theo dữ liệu của phiên.'
      }, page);
      session.updateBadge?.(`🎯 <strong>IP có lead:</strong> Đã phục hồi trang`);
    }
    return true;
  } catch (err) {
    session.addBrowserLog?.({
      type: 'lead_recovery_waiting',
      detail: `Lỗi trong quá trình phục hồi (${err.message}); giữ trình duyệt có lead mở và chờ lượt tiếp theo.`
    }, page);
    return true;
  } finally {
    page._leadRecoveryInProgress = false;
    state.busy = false;
  }
}
