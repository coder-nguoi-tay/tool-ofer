import { SWEEPSTAKES_CARD_SELECTOR } from './is-sweepstakes-card-page.mjs';
import { getAddeptOfferFrame } from './get-addept-offer-frame.mjs';
import { hasPendingOfferwallOpenings } from '../reserve-offerwall-tab-slot.mjs';
import { shouldStopAfterLead } from '../should-stop-after-lead.mjs';
import { shouldPauseForLead } from '../should-pause-for-lead.mjs';
import { readProxyUsageHistory } from '../../proxy/actions/read-proxy-usage-history.mjs';
import { persistProxyUsageHistory } from '../../proxy/actions/persist-proxy-usage-history.mjs';

/** Tab con (offer mở từ màn card) được làm tối đa chừng này rồi đóng (người dùng chốt 2026-11-15: 5 phút). */
export const SUB_TAB_MAX_MS = 5 * 60_000;
/** Hết tab con và hết thẻ chưa mở liên tục chừng này mới đóng trình duyệt (tránh đóng giữa lúc mở thẻ kế tiếp). */
export const FINISH_STABLE_MS = 5_000;
const subTabSeenAt = new WeakMap();
const stableSince = new WeakMap();

/**
 * Đếm thẻ trên màn card còn chưa mở (chỉ đọc, không đổi DOM). Thẻ thường: thẻ lá có link http(s) thật, chưa có
 * data-ux-opened (khung bọc chứa thẻ con không tính). Addept trong iframe: thẻ .unit-card chưa data-ux-ow-clicked,
 * cộng 1 nếu khung #infoPanel còn mở.
 * @param {object} page Tab gốc màn card.
 * @return {Promise<number|null>} Số thẻ chưa mở; null khi không đọc được (coi như chưa xong).
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export async function countPendingSweepstakesCards(page) {
  try {
    const placement = await getAddeptOfferFrame(page);
    if (placement?.frame) {
      // Hàm viết thẳng trong evaluate (không eval): trang có CSP cấm eval vẫn đọc được.
      return await placement.frame.evaluate(() => {
        const visible = element => {
          for (let node = element; node; node = node.parentElement) {
            const style = getComputedStyle(node);
            if (node.hidden || style.display === 'none' || style.visibility === 'hidden') return false;
          }
          return element.getClientRects().length > 0;
        };
        const panel = document.querySelector('#infoPanel');
        const cards = Array.from(document.querySelectorAll('.unit-stack .unit-card')).filter(card => visible(card) && card.getAttribute('data-ux-ow-clicked') !== '1');
        return cards.length + (panel && visible(panel) ? 1 : 0);
      });
    }
    return await page.evaluate(selector => {
      const visible = element => {
        for (let node = element; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (node.hidden || style.display === 'none' || style.visibility === 'hidden') return false;
        }
        return element.getClientRects().length > 0;
      };
      const cards = Array.from(document.querySelectorAll(selector));
      const leaves = cards.filter(card => !cards.some(other => other !== card && card.contains(other)));
      const hasRealLink = card => [card, ...card.querySelectorAll('a[href], [data-destination-url]')].some(link => {
        const raw = link.getAttribute('href') || link.getAttribute('data-destination-url');
        if (!raw || /^(#|javascript:)/i.test(raw)) return false;
        try {
          const target = new URL(raw, document.baseURI);
          return /^https?:$/.test(target.protocol) && target.href !== location.href && !/\/(?:privacy|terms|policies|contact|accessibility)(?:[-_/.?]|$)/i.test(target.pathname);
        } catch { return false; }
      });
      return leaves.filter(card => visible(card) && !card.closest('[data-ux-opened="1"]') && hasRealLink(card)).length;
    }, SWEEPSTAKES_CARD_SELECTOR);
  } catch { return null; }
}

/**
 * Kết thúc màn card sweepstakes (trang cuối mở hết link):
 *  1. Mỗi tab con (offer mở từ màn card) làm tối đa 5 phút kể từ lúc xuất hiện rồi đóng.
 *  2. Khi đã mở hết thẻ và không còn tab con nào (ổn định 5 giây), đóng trình duyệt để nhường slot mới —
 *     áp dụng cả IP có lead như hoàn tất thankyou.php; riêng chế độ "dừng autofill sau lead" thì giữ nguyên.
 * Gọi mỗi nhịp của bộ canh phiên (watchTrafficBlockedPage).
 *
 * @param {object} session Phiên trình duyệt.
 * @param {Function} closeSession closeSessionAndRefill của bộ canh.
 * @param {number} [now=Date.now()] Thời điểm (test).
 * @param {object} [deps] readPending, hasPendingOpenings, persistOutcome (tiêm cho test).
 * @return {Promise<boolean>} True nếu vừa đóng trình duyệt.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export async function finishSweepstakesCardSession(session, closeSession, now = Date.now(), {
  readPending = countPendingSweepstakesCards,
  hasPendingOpenings = hasPendingOfferwallOpenings,
  persistOutcome = persistCompletedOutcome,
} = {}) {
  // Không bao giờ ném lỗi ra bộ canh phiên: lỗi ở đây không được chặn các nhánh khác trong cùng nhịp kiểm tra.
  try {
    if (!session || session.isClosed || session.suppressAutoRefill || shouldStopAfterLead(session)) return false;
    const pages = (typeof session.browser?.pages === 'function' ? await session.browser.pages() : []).filter(page => !page.isClosed());
    const root = pages.find(page => page._uxOriginTab && page._uxSweepstakesCardPageUrl && page._uxSweepstakesCardPageUrl === page.url());
    if (!root) { stableSince.delete(session); return false; }

    for (const tab of pages) {
      if (tab === root) continue;
      if (!subTabSeenAt.has(tab)) subTabSeenAt.set(tab, now);
      if (now - subTabSeenAt.get(tab) < SUB_TAB_MAX_MS) continue;
      const url = tab.url();
      session.addBrowserLog?.({ type: 'sweepstakes_sub_tab_timeout', detail: `Tab con offer đã làm ${Math.round(SUB_TAB_MAX_MS / 60_000)} phút; đóng tab: ${url}` });
      tab._uxClosedByApp = 'tab con màn card quá 5 phút';
      await tab.close().catch(() => {});
    }

    const subTabsLeft = pages.some(tab => tab !== root && !tab.isClosed());
    const busy = subTabsLeft || hasPendingOpenings(root.context?.()) || session.leadCheckStatus === 'checking' || shouldPauseForLead(session)
      || root._aiAssistRunning || root._aiFormFixing || root._continuousAgent || root._leadRecoveryInProgress;
    if (busy) { stableSince.delete(session); return false; }
    const pending = await readPending(root);
    if (pending !== 0) { stableSince.delete(session); return false; }
    if (!stableSince.has(session)) { stableSince.set(session, now); return false; }
    if (now - stableSince.get(session) < FINISH_STABLE_MS) return false;

    stableSince.delete(session);
    await persistOutcome(session).catch(() => {});
    session.addBrowserLog?.({ type: 'sweepstakes_completed', detail: 'Màn card đã mở hết offer và không còn tab con; đóng trình duyệt để nhường slot mới.' });
    await closeSession({ completedFinancialFlow: true });
    return session.isClosed === true;
  } catch { return false; }
}

/**
 * Ghi lịch sử proxy là đã hoàn tất (như hoàn tất thankyou.php) để không dùng lại IP cho offer này.
 * @param {object} session Phiên vừa hoàn tất.
 * @return {Promise<void>}
 */
async function persistCompletedOutcome(session) {
  if (!session.proxyKey) return;
  const history = await readProxyUsageHistory();
  if (!history?.proxies?.[session.proxyKey]) return;
  history.proxies[session.proxyKey] = { ...history.proxies[session.proxyKey], status: 'completed', reason: 'Màn card SweepstakesAlerts đã mở hết offer', completedAt: new Date().toISOString() };
  await persistProxyUsageHistory(history);
}
