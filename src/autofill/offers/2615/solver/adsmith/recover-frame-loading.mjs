// Bản giải riêng của offer 2615, chép từ src/autofill/adsmith/recover-frame-loading.mjs ngày 2026-11-17. Sửa ở đây không ảnh hưởng giải chung.
import { inspectAdsmithFrameLoading } from './inspect-frame-loading.mjs';
import { shouldPauseForLead } from '../should-pause-for-lead.mjs';
import { shouldStopAfterLead } from '../should-stop-after-lead.mjs';
import { hasPendingFrameRequests } from '../../../../../browser/frames/pending-frame-requests.mjs';
import { lastIframeContentRequestSettledAt, reloadObservedIframe } from '../../../../frames/reload-observed-iframe.mjs';

const observations = new WeakMap();
const waitMs = { spinner_stuck: 25000, frame_blank: 20000, chrome_error: 4000 };
const maxReloads = 5;
const maxFrameReloads = 2;

/**
 * Chờ frame Adsmith tải và giữ quyền điều khiển của người dùng khi xuất hiện CAPTCHA trong lượt phục hồi.
 * @param {object} page Tab chứa iframe, không đóng browser hoặc thay IP.
 * @param {object} session Phiên sở hữu tab và cờ bảo vệ lead.
 * @param {object} options Callback log và chính sách chờ lead.
 * @param {number} [now=Date.now()] Đồng hồ quan sát để kiểm thử ngưỡng mà không sleep.
 * @return {Promise<boolean>} True khi handler đang giữ tab chờ/phục hồi/hết lượt, ngăn AI/F5 khác.
 * @throws {never} Reload thất bại vẫn tính một lượt và chờ lại, không thoát browser.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export async function recoverAdsmithFrameLoading(page, session, options = {}, now = Date.now()) {
  let tab = observations.get(page);
  if (!tab) { tab = { urls: new Map(), pending: false }; observations.set(page, tab); }
  if (tab.pending) return true;
  const url = page.url();
  const key = url.split('#')[0];
  if (tab.currentKey !== key) {
    const previous = tab.urls.get(tab.currentKey);
    if (previous) previous.kind = null;
    tab.currentKey = key;
  }
  let state = tab.urls.get(key);
  if (page._manualCaptchaPending || session.isClosed || page.isClosed() || ['manual', 'skip', 'consent_only'].includes(session.offerMode) || shouldPauseForLead(session, options) || shouldStopAfterLead(session)
    || page._aiAssistRunning || page._aiFormFixing || page._continuousAgent || page._leadRecoveryInProgress) {
    if (state) { state.kind = null; state.since = now; }
    return page._manualCaptchaPending === true;
  }
  tab.pending = true;
  try {
    const snapshot = await inspectAdsmithFrameLoading(page);
    if (page._manualCaptchaPending) {
      if (state) state.kind = null;
      return true;
    }
    if (page.isClosed() || page.url() !== url) return false;
    if (snapshot.state === 'normal' || snapshot.state === 'not_applicable') {
      if (state) state.kind = null;
      return false;
    }
    const pending = hasPendingFrameRequests(page);
    if (snapshot.state === 'unavailable' || pending) {
      if (state) {
        state.lastSeen = now;
        if (snapshot.state === 'unavailable' || hasPendingFrameRequests(page, undefined, true)) { state.kind = null; state.since = now; }
      }
      return Boolean(state || snapshot.applicable || pending);
    }
    if (!state) { state = { reloads: 0, exhaustedLogged: false }; tab.urls.set(key, state); }
    if (state.documentId !== snapshot.documentId) state.frameReloads = 0;
    const settledAt = lastIframeContentRequestSettledAt(page, snapshot.frame);
    if (state.kind !== snapshot.state || state.settledAt !== settledAt || state.source !== snapshot.source
      || state.childUrl !== snapshot.childUrl || state.childDocumentId !== snapshot.childDocumentId
      || state.documentId !== snapshot.documentId || now - (state.lastSeen ?? now) > 15000) state.since = now;
    state.settledAt = settledAt;
    state.documentId = snapshot.documentId;
    state.source = snapshot.source;
    state.childUrl = snapshot.childUrl;
    state.childDocumentId = snapshot.childDocumentId;
    state.kind = snapshot.state;
    state.lastSeen = now;
    page._lateProgressRecoveryActive = false;
    // Ưu tiên hiện iframe offer: nạp lại riêng iframe (giữ trang cha) ở 30% và 60% thời gian chờ, rồi mới F5 trang cha.
    const frameReloads = state.frameReloads ?? 0;
    if (state.kind !== 'spinner_stuck' && state.reloads < maxReloads && frameReloads < maxFrameReloads && now - state.since >= waitMs[state.kind] * 0.3 * (frameReloads + 1)
      && now - state.since < waitMs[state.kind]) {
      if (await reloadObservedIframe(page, snapshot.frame, snapshot, settledAt)) {
        state.frameReloads = frameReloads + 1;
        options.onLog?.({ type: 'adsmith_frame_reload', detail: `${snapshot.reason} Nạp lại riêng iframe khảo sát, lần ${state.frameReloads}/${maxFrameReloads} (giữ trang cha).`, frameReloads: state.frameReloads, loadingState: state.kind }, page);
      }
      return true;
    }
    if (now - state.since < waitMs[state.kind]) return true;
    if (state.reloads >= maxReloads) {
      if (!state.exhaustedLogged) {
        state.exhaustedLogged = true;
        options.onLog?.({ type: 'iframe_load_exhausted', detail: `Iframe Adsmith vẫn không tải sau ${maxReloads} lần phục hồi; dừng F5, giữ browser để kiểm tra proxy.`, reloads: state.reloads }, page);
      }
      return true;
    }
    if (session.isClosed || page.isClosed() || page.url() !== url || hasPendingFrameRequests(page) || shouldPauseForLead(session, options) || shouldStopAfterLead(session) || page._aiAssistRunning || page._aiFormFixing || page._continuousAgent || page._leadRecoveryInProgress) return true;
    const current = await inspectAdsmithFrameLoading(page);
    if (current.state !== snapshot.state || current.documentId !== snapshot.documentId || current.source !== snapshot.source ||
      current.childUrl !== snapshot.childUrl || current.childDocumentId !== snapshot.childDocumentId ||
      page.url() !== url || hasPendingFrameRequests(page) || lastIframeContentRequestSettledAt(page, current.frame) !== settledAt ||
      page._manualCaptchaPending || session.isClosed || shouldPauseForLead(session, options) || shouldStopAfterLead(session) ||
      page._aiAssistRunning || page._aiFormFixing || page._continuousAgent || page._leadRecoveryInProgress) return true;
    state.reloads++;
    options.onLog?.({ type: 'adsmith_loading_timeout_reload', detail: `${snapshot.reason} Tải lại trang cha bằng GET, lần ${state.reloads}/${maxReloads}.`, reloads: state.reloads, loadingState: state.kind }, page);
    const started = Date.now();
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }); }
    catch { options.onLog?.({ type: 'adsmith_loading_reload_failed', detail: 'Trang cha chưa tải xong; giữ phiên và chờ lại trước lượt phục hồi tiếp.' }, page); }
    finally { state.since = state.lastSeen = now + Date.now() - started; }
    return true;
  } finally { tab.pending = false; }
}
