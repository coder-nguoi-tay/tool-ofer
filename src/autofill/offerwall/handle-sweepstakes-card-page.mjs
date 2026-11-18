import { MAX_CONCURRENT_SUB_OFFERS } from '../../runtime/constants/max-concurrent-sub-offers.mjs';
import { isSweepstakesCardPage, SWEEPSTAKES_CARD_SELECTOR, SWEEPSTAKES_IFRAME_CARD_SELECTOR } from './is-sweepstakes-card-page.mjs';
import { prepareSweepstakesCardPage } from './prepare-sweepstakes-card-page.mjs';
import { handleOfferwallCards } from '../handle-offerwall-cards.mjs';
import { shouldPauseForLead } from '../should-pause-for-lead.mjs';
import { addActionCount } from '../add-action-count.mjs';
import { getAddeptOfferFrame } from './get-addept-offer-frame.mjs';
import { handleOfferwallTasks } from '../handle-offerwall-tasks.mjs';
import { MAX_OFFER_TABS } from '../../runtime/constants/max-offer-tabs.mjs';

const activeCardScans = new WeakSet();

/**
 * Điều phối tuần tự màn card SweepstakesAlerts trước pipeline form, không chạy chồng các lượt quét.
 * @param {object} page Tab đang quét.
 * @param {object} session Phiên giữ nguyên record/IP/lead.
 * @param {object} options Cấu hình tự điền và trần tab con.
 * @return {Promise<boolean>} True khi màn card đã nhận diện và thuộc handler này.
 * @throws {Error} Khi context bị ngắt trong lúc chuẩn bị; watcher giữ quyền phục hồi phiên.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
export async function handleSweepstakesCardPage(page, session, options) {
  if (!await isSweepstakesCardPage(page)) { page._uxSweepstakesCardPageUrl = null; return false; }
  page._uxSweepstakesCardPageUrl = page.url();
  if (session.offerMode === 'consent_only' || options.autoSubmit === false) return true;
  if (activeCardScans.has(page)) return true;
  activeCardScans.add(page);
  try {
    const placement = await getAddeptOfferFrame(page);
    const frame = placement ? placement.frame : page.mainFrame();
    const cardSelector = placement ? SWEEPSTAKES_IFRAME_CARD_SELECTOR : SWEEPSTAKES_CARD_SELECTOR;
    if (!frame) return true;
    if (placement && !await frame.locator(`.unit-stack .unit-card, #infoPanel, ${cardSelector}`).evaluateAll(elements => elements.some(element => {
      const style = getComputedStyle(element);
      return !element.closest('header, footer, nav, aside, [role="complementary"], .sidebar, .ow-attribution') && element.getClientRects().length > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    })).catch(() => false)) return true;
    if (await prepareSweepstakesCardPage(page, session, options)) {
      if (session.isClosed || page.isClosed() || shouldPauseForLead(session, options)) return true;
      const hasTasks = placement && await frame.locator('.unit-stack, #infoPanel').count().catch(() => 0);
      if (hasTasks && page.context().pages().filter(tab => !tab.isClosed()).length >= 1 + MAX_CONCURRENT_SUB_OFFERS) return true;
      const opened = hasTasks ? await handleOfferwallTasks(page, frame, {
        ...options, isCancelled: () => session.isClosed || page.isClosed() || shouldPauseForLead(session, options)
      }) : await handleOfferwallCards(frame, page, {
        ...options, cardSelector, orderedCards: true,
        isCancelled: () => session.isClosed || page.isClosed() || shouldPauseForLead(session, options)
      });
      if (opened) { addActionCount(session, opened); session.lastActionTime = Date.now(); }
    }
    return true;
  } finally { activeCardScans.delete(page); }
}
