import { protectConfirmedLeadSession } from './protect-confirmed-lead-session.mjs';
import { readThrottledPageHealth } from '../page-health/read-throttled-page-health.mjs';
import { resetRecoveredPageAutofill } from '../../autofill/reset-recovered-page-autofill.mjs';
import { isOffer2615 } from '../../autofill/offers/2615/match-offer.mjs';

const recoveries = new WeakMap();
const MAX_RECOVERY_ATTEMPTS = 3;

/**
 * Phiên đã thao tác offer (điền ô/bấm chọn): form có thể đã gửi nên lead có thể về sau đó.
 * Đóng phiên lúc này để lại lead lỗi (sự cố 2026-11-15 IP 173.19.184.178), phải phục hồi trang trước.
 * @param {object} session Phiên trình duyệt.
 * @return {boolean} True khi autofill/AI đã thao tác trên trang offer.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export function hasOfferProgress(session) {
  return session?.lastActionTime != null;
}

/**
 * Giữ browser có lead hoặc đã thao tác offer, tải lại trang lỗi khi tab chưa chuyển sang xác minh thủ công.
 * Tuyệt đối không tắt trình duyệt khi IP đã có lead. Phiên chỉ mới thao tác offer: hết 3 lượt vẫn lỗi thì đặt
 * page._uxErrorRecoveryExhausted để watcher đóng và bù slot.
 * @param {object} session Phiên có IP được xác nhận lead.
 * @param {object} page Tab cần kiểm tra và phục hồi.
 * @return {Promise<boolean>} True khi đã gặp lỗi và giữ tab để phục hồi/chờ xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export async function recoverConfirmedLeadErrorPage(session, page) {
  const canRecover = () => protectConfirmedLeadSession(session) || hasOfferProgress(session);
  if (!canRecover() || session.isClosed || session.suppressAutoRefill || page?.isClosed?.() || page?._manualCaptchaPending) return false;
  const state = recoveries.get(page) || { busy: false, attempts: 0, lastAt: 0, url: '' };
  recoveries.set(page, state);
  if (state.busy || Date.now() - state.lastAt < 15_000) return false;
  state.busy = true;
  try {
    const errorUrl = page.url();
    const mainFrame = page.mainFrame?.() || page;
    const reason = page._uxMainStatus >= 400 ? 'Lỗi HTTP của trang' : await readThrottledPageHealth(mainFrame);
    if (!reason || !canRecover() || page._manualCaptchaPending || page.isClosed?.() || page.url() !== errorUrl) return false;
    if (state.url !== errorUrl) {
      Object.assign(state, { url: errorUrl, attempts: 0 });
      page._uxErrorRecoveryExhausted = false;
    }
    const hasLead = protectConfirmedLeadSession(session);
    const offer2615Flow = isOffer2615(page, session);
    // Luồng Offer 2615 nếu đã có lead: cứ tiếp tục F5 để làm hết phễu, không dừng sau 3 lần rồi tắt gây mất lead.
    // Các luồng khác: giới hạn MAX_RECOVERY_ATTEMPTS rồi nhả cho watcher xử lý.
    if (!hasLead || !offer2615Flow) {
      if (state.attempts >= MAX_RECOVERY_ATTEMPTS) {
        page._uxErrorRecoveryExhausted = true;
        return true;
      }
    }
    state.attempts++;
    state.lastAt = Date.now();
    const who = hasLead ? (offer2615Flow ? 'Offer 2615 (IP đã có lead)' : 'IP đã có lead') : 'Phiên đã thao tác offer';
    const attemptText = (hasLead && offer2615Flow) ? `lượt ${state.attempts}` : `lượt ${state.attempts}/${MAX_RECOVERY_ATTEMPTS}`;
    session.addBrowserLog?.({
      type: 'lead_error_recovery',
      detail: `${who} gặp trang lỗi (${reason}): giữ trình duyệt, tải lại trang bằng F5 (${attemptText}).`
    }, page);
    session.updateBadge?.(`🔄 <strong>${who}:</strong> Đang F5 tải lại trang lỗi (${attemptText})…`);
    console.log(`[LeadRecovery] Slot ${session.slot || '?'}: ${who} gặp lỗi "${reason}". Giữ trình duyệt, tải lại trang bằng F5 (${attemptText}).`);

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
    if (reloadStillDead && !page._manualCaptchaPending && typeof page.goBack === 'function') {
      try {
        const backResponse = await page.goBack({ waitUntil: 'domcontentloaded', timeout: 8000 });
        if (backResponse) response = backResponse;
        page._uxHealthRevision = (page._uxHealthRevision || 0) + 1;
        mainFrame._uxHealthRevision = (mainFrame._uxHealthRevision || 0) + 1;
        page._uxMainStatus = response?.status?.() || 0;
      } catch {}
    }

    if (!canRecover() || page._manualCaptchaPending || page.isClosed?.() || session.isClosed) return true;

    const stillDead = page.url() === errorUrl && !response ||
      !/^https?:/.test(page.url()) ||
      page._uxMainStatus >= 400 ||
      await readThrottledPageHealth(mainFrame);

    if (stillDead) {
      session.addBrowserLog?.({
        type: 'lead_recovery_waiting',
        detail: `Trang vẫn còn lỗi sau khi tải lại (${attemptText}); giữ trình duyệt mở và tiếp tục chờ phục hồi.`
      }, page);
      return true;
    }

    await resetRecoveredPageAutofill(page, session);
    if (canRecover() && !session.isClosed && !page.isClosed?.()) {
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
