import { protectConfirmedLeadSession } from './protect-confirmed-lead-session.mjs';
import { shouldStopAfterLead } from '../../autofill/should-stop-after-lead.mjs';
import { hasPendingOfferwallOpenings } from '../../autofill/reserve-offerwall-tab-slot.mjs';
import { hasUnfinishedOfferWork } from './has-unfinished-offer-work.mjs';
import { countPendingAddeptOffers } from '../../autofill/offerwall/count-pending-addept-offers.mjs';

/** Tab con phải sống ít nhất chừng này mới tính là "offer con đã làm" (tab bị chặn/trùng chỉ chớp mở rồi đóng ngay). */
export const SUB_OFFER_MIN_LIFETIME_MS = 10_000;
/**
 * Hết offer con, trang chính hết việc, cùng URL liên tục chừng này mới đóng trình duyệt. 15 giây (trước là 5): trang
 * cuối vừa tải chưa kịp được autofill bấm offer đầu tiên thì không bị đóng (lỗi 2026-11-16).
 */
export const LEAD_FINISH_STABLE_MS = 15_000;

/**
 * Trang chính còn việc: còn form/câu hỏi/offer chưa mở (hasUnfinishedOfferWork) hoặc còn offer Addept chưa bấm.
 * @param {object} page Tab chính.
 * @return {Promise<boolean>} True nếu còn việc.
 */
async function mainPageHasPendingWork(page) {
  if (await hasUnfinishedOfferWork(page)) return true;
  return await countPendingAddeptOffers(page) > 0;
}
const states = new WeakMap();

/**
 * Phiên đã có lead (người dùng chốt 2026-11-16): khi các offer con đã làm và đã đóng hết thì đóng trình duyệt để lấy slot
 * mới. Offer con = mọi tab ngoài tab chính, sống ít nhất 10 giây. Chỉ đóng khi trang chính cũng hết việc (không còn
 * form/câu hỏi/offer chưa mở, kể cả offer Addept chưa bấm) và giữ cùng URL 15 giây. Màn card sweepstakes do finishSweepstakesCardSession
 * xử lý riêng (mở hết thẻ, tab con tối đa 5 phút). Giữ trình duyệt khi bật "dừng autofill khi có lead".
 * Gọi mỗi nhịp của bộ canh phiên; không bao giờ ném lỗi ra ngoài.
 *
 * @param {object} session Phiên trình duyệt.
 * @param {Function} closeSession closeSessionAndRefill của bộ canh phiên.
 * @param {number} [now=Date.now()] Thời điểm (test).
 * @param {{hasPendingOpenings?:Function,readPendingWork?:Function}} [deps] Tiêm cho test.
 * @return {Promise<boolean>} True nếu vừa đóng trình duyệt.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
export async function finishLeadSessionAfterSubOffers(session, closeSession, now = Date.now(), { hasPendingOpenings = hasPendingOfferwallOpenings, readPendingWork = mainPageHasPendingWork } = {}) {
  try {
    if (!session || session.isClosed || (session.suppressAutoRefill && !session._autoStopLeadPending) || shouldStopAfterLead(session) || !protectConfirmedLeadSession(session)) return false;
    const pages = (typeof session.browser?.pages === 'function' ? await session.browser.pages() : []).filter(page => !page.isClosed());
    const main = session.mainPage && !session.mainPage.isClosed() ? session.mainPage : pages[0];
    if (!main) return false;
    if (main._uxOriginTab && main._uxSweepstakesCardPageUrl === main.url()) return false;
    let state = states.get(session);
    if (!state) { state = { seenAt: new WeakMap(), worked: false, stableSince: null }; states.set(session, state); }
    const subs = pages.filter(page => page !== main);
    for (const page of subs) {
      if (!state.seenAt.has(page)) state.seenAt.set(page, now);
      if (now - state.seenAt.get(page) >= SUB_OFFER_MIN_LIFETIME_MS) state.worked = true;
    }
    const busy = subs.length > 0 || hasPendingOpenings(main.context?.()) || session.leadCheckRunning
      || main._aiAssistRunning || main._aiFormFixing || main._continuousAgent || main._leadRecoveryInProgress;
    if (!state.worked || busy) { state.stableSince = null; return false; }
    // Trang cuối còn offer/form chưa làm (chưa kịp bấm offer con đầu tiên) thì chưa phải "đã xong offer con".
    if (await readPendingWork(main)) { state.stableSince = null; return false; }
    const url = main.url();
    if (state.stableUrl !== url) { state.stableUrl = url; state.stableSince = null; }
    state.stableSince ??= now;
    if (now - state.stableSince < LEAD_FINISH_STABLE_MS) return false;
    session.addBrowserLog?.({ type: 'lead_sub_offers_finished', detail: `IP ${session.exitIp ?? 'chưa rõ'} đã có lead và các offer con đã đóng hết; đóng trình duyệt để lấy slot mới. Trang chính: ${url}` });
    await closeSession({ completedFinancialFlow: true });
    return session.isClosed === true;
  } catch { return false; }
}
