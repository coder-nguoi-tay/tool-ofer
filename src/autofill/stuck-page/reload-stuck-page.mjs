import { shouldPauseForLead } from '../should-pause-for-lead.mjs';
import { isThankYouUrl } from '../../leads/actions/is-thank-you-url.mjs';
import { isFinancialhelpThankyouUrl } from '../../leads/actions/is-financialhelp-thankyou-url.mjs';
import { isFinancialhelpPathThankyouUrl } from '../../leads/actions/is-financialhelp-path-thankyou-url.mjs';
import { isOffer2615 } from '../offers/2615/match-offer.mjs';
import { protectConfirmedLeadSession } from '../../leads/actions/protect-confirmed-lead-session.mjs';

/** Trang đứng yên liên tục bao lâu thì F5 (yêu cầu người dùng 2026-11-15: khoảng 2 phút). */
export const STUCK_PAGE_RELOAD_MS = 120_000;
/** Số lần F5 tối đa cho cùng một URL; hết lượt thì chỉ báo, không F5 vòng lặp. */
const MAX_RELOADS_PER_URL = 3;
/**
 * Hai lần quan sát cách nhau quá khoảng này thì coi như không quan sát được (lượt quét bị chặn vì AI/agent/lead
 * đang giữ tab): đếm lại từ đầu, để không F5 ngay khi một luồng khác vừa kết thúc.
 */
const OBSERVATION_GAP_MS = 15_000;
const states = new WeakMap();

/**
 * Luồng đang chạy hoặc trang có logic xử lý riêng: không được F5.
 * @param {object} page Tab.
 * @param {object} session Phiên.
 * @param {object} options Tuỳ chọn autofill (chính sách chờ lead).
 * @return {boolean} True nếu phải bỏ qua.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
function isBusyOrHandledElsewhere(page, session, options) {
  const url = page.url();
  return !/^https?:/i.test(url) || session.isClosed || page.isClosed()
    || page._autofillWaitReason || page._aiAssistRunning || page._aiFormFixing || page._continuousAgent || page._leadRecoveryInProgress || page._lateProgressRecoveryActive
    || session.leadCheckStatus === 'checking' || shouldPauseForLead(session, options)
    || ['manual', 'skip', 'consent_only'].includes(session.offerMode)
    || isThankYouUrl(url) || isFinancialhelpThankyouUrl(url) || isFinancialhelpPathThankyouUrl(url)
    || /toffers\.top|adtrapper|adswapper/i.test(url);
}

/**
 * F5 tab khi trang "đứng hình" ~2 phút: cùng URL, giao diện không đổi, và cả phiên không có thao tác nào
 * (bộ đếm điền/bấm và mốc lastActionTime dùng chung mọi tab, nên offer phụ ở tab khác đang chạy cũng giữ tab này).
 * Chỉ đếm khi được quan sát liên tục và không có luồng nào khác (AI, agent, chờ/kiểm lead, phục hồi lỗi) đang giữ tab.
 * Tải lại bằng điều hướng GET tới đúng URL để không gửi lại form POST (dialog "Confirm resubmission" sẽ bị auto-accept).
 *
 * @param {object} page Tab đang quét.
 * @param {object} session Phiên sở hữu tab.
 * @param {string} signature Chữ ký giao diện hiện tại (readVisiblePageState).
 * @param {object} [options={}] Tuỳ chọn autofill (onLog, chính sách lead).
 * @param {number} [now=Date.now()] Thời điểm quan sát (test).
 * @param {{thresholdMs?:number}} [settings={}] Ngưỡng đứng yên riêng (trang Adsmith: 40 giây).
 * @return {Promise<boolean>} True nếu vừa F5.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export async function reloadStuckPage(page, session, signature, options = {}, now = Date.now(), { thresholdMs = STUCK_PAGE_RELOAD_MS } = {}) {
  const url = page.url();
  const activity = `${session.autofillFields ?? 0}:${session.autofillActions ?? 0}:${session.lastActionTime ?? 0}:${page._uxManualInputAt ?? 0}`;
  let state = states.get(page);
  if (!state || state.url !== url) { state = { url, reloads: 0, since: now, exhaustedLogged: false }; states.set(page, state); }
  const busy = isBusyOrHandledElsewhere(page, session, options);
  if (busy || state.signature !== signature || state.activity !== activity || now - (state.lastCheckAt ?? now) > OBSERVATION_GAP_MS) state.since = now;
  Object.assign(state, { signature, activity, lastCheckAt: now });
  if (busy || now - state.since < thresholdMs) return false;
  const hasLead = protectConfirmedLeadSession(session);
  const offer2615Flow = isOffer2615(page, session);
  if (!hasLead || !offer2615Flow) {
    if (state.reloads >= MAX_RELOADS_PER_URL) {
      if (!state.exhaustedLogged) {
        state.exhaustedLogged = true;
        options.onLog?.({ type: 'stuck_page_reload_exhausted', detail: `Trang vẫn đứng yên sau ${MAX_RELOADS_PER_URL} lần F5; không F5 thêm, chờ thay đổi hoặc người thao tác.` }, page);
      }
      return false;
    }
  }
  state.reloads += 1;
  const reloadText = (hasLead && offer2615Flow) ? `lần ${state.reloads}` : `lần ${state.reloads}/${MAX_RELOADS_PER_URL}`;
  options.onLog?.({ type: 'stuck_page_reload', detail: `Trang đứng yên ${thresholdMs >= 60_000 ? `${Math.round(thresholdMs / 60_000)} phút` : `${Math.round(thresholdMs / 1000)} giây`} (không thao tác, giao diện không đổi); F5 ${reloadText}: ${url}` }, page);
  const startedAt = Date.now();
  try {
    if (url.includes('#')) await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
    else await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  } catch {
    options.onLog?.({ type: 'stuck_page_reload_failed', detail: 'F5 chưa tải xong; giữ trình duyệt, đếm lại từ đầu.' }, page);
  } finally {
    // Đếm lại 2 phút từ lúc F5 xong (cộng thời gian tải vào mốc quan sát).
    state.since = state.lastCheckAt = now + (Date.now() - startedAt);
  }
  return true;
}
