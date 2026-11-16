import { inspectAdsmithFrameLoading } from './inspect-frame-loading.mjs';
import { shouldPauseForLead } from '../should-pause-for-lead.mjs';
import { shouldStopAfterLead } from '../should-stop-after-lead.mjs';
import { isOffer2615 } from '../offers/2615/match-offer.mjs';
import { protectConfirmedLeadSession } from '../../leads/actions/protect-confirmed-lead-session.mjs';

const observations = new WeakMap();
const waitMs = { spinner_stuck: 25000, frame_blank: 20000, chrome_error: 4000 };
const maxReloads = 5;

/**
 * Giữ quyền phục hồi frame Adsmith: chờ lag, GET lại trang cha tối đa năm lần mỗi URL và chống chạy chồng.
 * @param {object} page Tab chứa iframe, không đóng browser hoặc thay IP.
 * @param {object} session Phiên sở hữu tab và cờ bảo vệ lead.
 * @param {object} options Callback log và chính sách chờ lead.
 * @param {number} [now=Date.now()] Đồng hồ quan sát để kiểm thử ngưỡng mà không sleep.
 * @return {Promise<boolean>} True khi handler đang giữ tab chờ/phục hồi/hết lượt, ngăn AI/F5 khác.
 * @throws {never} Reload thất bại vẫn tính một lượt và chờ lại, không thoát browser.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
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
  if (session.isClosed || page.isClosed() || ['manual', 'skip', 'consent_only'].includes(session.offerMode) || shouldPauseForLead(session, options) || shouldStopAfterLead(session)
    || page._aiAssistRunning || page._aiFormFixing || page._continuousAgent || page._leadRecoveryInProgress) {
    if (state) { state.kind = null; state.since = now; }
    return false;
  }
  tab.pending = true;
  try {
    const snapshot = await inspectAdsmithFrameLoading(page);
    if (page.isClosed() || page.url() !== url) return false;
    if (snapshot.state === 'normal' || snapshot.state === 'not_applicable') {
      if (state) state.kind = null;
      return false;
    }
    if (snapshot.state === 'unavailable') {
      if (state) { state.kind = null; state.since = now; }
      return Boolean(state || snapshot.applicable);
    }
    if (!state) { state = { reloads: 0, exhaustedLogged: false }; tab.urls.set(key, state); }
    if (state.kind !== snapshot.state || state.documentId !== snapshot.documentId || now - (state.lastSeen ?? now) > 15000) state.since = now;
    state.documentId = snapshot.documentId;
    state.kind = snapshot.state;
    state.lastSeen = now;
    page._lateProgressRecoveryActive = false;
    if (now - state.since < waitMs[state.kind]) return true;
    const hasLead = protectConfirmedLeadSession(session);
    const offer2615Flow = isOffer2615(page, session);
    if (!hasLead || !offer2615Flow) {
      if (state.reloads >= maxReloads) {
        if (!state.exhaustedLogged) {
          state.exhaustedLogged = true;
          options.onLog?.({ type: 'iframe_load_exhausted', detail: `Iframe Adsmith vẫn không tải sau ${maxReloads} lần phục hồi; dừng F5, giữ browser để kiểm tra proxy.`, reloads: state.reloads }, page);
        }
        return true;
      }
    }
    if (session.isClosed || page.isClosed() || page.url() !== url || shouldPauseForLead(session, options) || shouldStopAfterLead(session) || page._aiAssistRunning || page._aiFormFixing || page._continuousAgent || page._leadRecoveryInProgress) return true;
    state.reloads++;
    const reloadText = (hasLead && offer2615Flow) ? `lần ${state.reloads}` : `lần ${state.reloads}/${maxReloads}`;
    options.onLog?.({ type: 'adsmith_loading_timeout_reload', detail: `${snapshot.reason} Tải lại trang cha bằng GET, ${reloadText}.`, reloads: state.reloads, loadingState: state.kind }, page);
    const started = Date.now();
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }); }
    catch { options.onLog?.({ type: 'adsmith_loading_reload_failed', detail: 'Trang cha chưa tải xong; giữ phiên và chờ lại trước lượt phục hồi tiếp.' }, page); }
    finally { state.since = state.lastSeen = now + Date.now() - started; }
    return true;
  } finally { tab.pending = false; }
}
