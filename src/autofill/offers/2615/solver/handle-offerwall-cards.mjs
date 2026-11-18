// Bản giải riêng của offer 2615, chép từ src/autofill/handle-offerwall-cards.mjs ngày 2026-11-17. Sửa ở đây không ảnh hưởng giải chung.
import { OFFER_2615_MAX_SUB_TABS as MAX_CONCURRENT_SUB_OFFERS } from '../limits.mjs';
import { markOfferwallCardProcessed } from './mark-offerwall-card-processed.mjs';
import { readOfferwallCards } from './read-offerwall-cards.mjs';
import { reserveOfferwallCard } from './reserve-offerwall-card.mjs';
import { isExcludedOfferPageUrl } from '../../../../browser/tabs/is-excluded-offer-page-url.mjs';
import { humanClick } from './human-click.mjs';
import { inspectInteractionReadiness } from '../../../../browser/locators/inspect-interaction-readiness.mjs';
import { reserveOfferLink } from '../../../../browser/tabs/reserve-offer-link.mjs';
import { OFFERWALL_CARD_SELECTOR } from './state/offerwall-card-selector.mjs';
import { reserveOfferwallTabSlot } from '../../../reserve-offerwall-tab-slot.mjs';
import { OFFER_2615_MAX_TABS as MAX_OFFER_TABS } from '../limits.mjs';
import { getOfferUrlState } from '../../../../browser/tabs/get-offer-url-state.mjs';
import { normalizeOfferUrl } from '../../../../browser/tabs/normalize-offer-url.mjs';

/**
 * Phát hiện và tự động mở tất cả các view/thẻ trên trang Offerwall cuối cùng.
 * Bấm CTA thật để HTML/JavaScript quyết định tab cha, tab con hoặc hủy điều hướng.
 * Tab con do website mở tiếp tục được xử lý bởi watcher của context.
 * Có trần số tab con đồng thời (mặc định MAX_OFFER_TABS trừ tab hiện tại): khi hết trần,
 * dừng mở thêm ở vòng quét này — thẻ chưa mở sẽ được thử lại vòng sau khi có tab hoàn tất.
 *
 * @param {object} frame Frame Playwright đang quét.
 * @param {object} [page=null] Page Playwright hiện tại để điều hướng trang gốc khi thẻ chỉ có link.
 * @param {object} [options={}] Trần tab con, cardSelector, orderedCards và callback isCancelled.
 * @return {Promise<number>} Số lượng thẻ offerwall đã được kích hoạt mở.
 * @throws {never} Lỗi tab/card được cô lập, giữ thẻ chưa mở cho lượt sau.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
async function handleOfferwallCards(frame, page = null, options = {}) {
  let openedCount = 0;
  const maxConcurrentSubOffers = Math.min(MAX_OFFER_TABS - 1, Math.max(0, Number(options.maxConcurrentSubOffers ?? MAX_CONCURRENT_SUB_OFFERS)));
  try {
    // Trần tab đồng thời được check lại trước MỖI thẻ — đủ trần thì dừng, giữ thẻ
    // chưa đánh dấu data-ux-opened để vòng quét sau (khi có tab hoàn tất nhả slot) mở tiếp.
    const cardSelector = options.cardSelector || OFFERWALL_CARD_SELECTOR;
    const cardsToOpen = await frame.evaluate(readOfferwallCards, options.orderedCards ? { selector: cardSelector, preferLeafCards: true } : cardSelector).catch(() => []);
    if (!cardsToOpen || !cardsToOpen.length) return 0;
    const sourceUrl = frame.url();
    for (const card of cardsToOpen) {
      if (frame.url() !== sourceUrl) break;
      if (options.isCancelled?.()) break;
      let releaseTabSlot, finishOfferLink, finishOfferCard;
      try {
        if (!card.hasBtn && (!card.destUrl || !card.destUrl.startsWith('http'))) {
          await markOfferwallCardProcessed(frame, card);
          continue;
        }

        if (isExcludedOfferPageUrl(card.destUrl)) {
          await markOfferwallCardProcessed(frame, card);
          continue;
        }
        finishOfferCard = reserveOfferwallCard(page, card);
        if (!finishOfferCard) {
          if (finishOfferCard === false) {
            finishOfferCard = null;
            if (options.orderedCards) break;
            continue;
          }
          await markOfferwallCardProcessed(frame, card);
          continue;
        }
        finishOfferLink = reserveOfferLink(page, card.destUrl);
        if (!finishOfferLink) {
          if (options.orderedCards && getOfferUrlState(page.context()).pending.has(normalizeOfferUrl(card.destUrl, page.url()))) break;
          await markOfferwallCardProcessed(frame, card);
          continue;
        }

        // Chuẩn giữ mỗi thẻ: đủ trần tab đồng thời thì dừng mở thêm (chưa đánh dấu gì,
        // thẻ này sẽ được mở ở vòng quét sau).
        releaseTabSlot = card.opensAuxiliaryContext ? reserveOfferwallTabSlot(page, maxConcurrentSubOffers) : () => {};
        if (!releaseTabSlot) break;
        const cardLoc = frame.locator(options.orderedCards ? `:is(${cardSelector})[data-ux-card-id="${card.uid}"]` : `[data-ux-card-id="${card.uid}"]`).first();
        if ((await cardLoc.count()) <= 0) continue;
        if (options.orderedCards && !await cardLoc.isVisible().catch(() => false)) continue;
        if (options.isCancelled?.()) break;
        let opened = false;
        const btn = (card.buttonUid ? frame : cardLoc).locator(card.buttonUid ? `[data-ux-offer-cta-id="${card.buttonUid}"]` : '.offerwall-btn, button[type="submit"], button#btnSubmit, a.offerwall-btn, [data-tf-element-role="offer-btn"], ' + 'a[id^="ct-creative-submit-"], button[id^="ct-creative-submit-"], .ct-creative-submit, .ai-submit-button, ' + 'button.question-answer-button, button[id^="answer-"], .eligibility-btn, [data-mock-secondary-offer-action], ' + '.offer-button, .btn-offer, .claim-button, a[class*="offer"], button[class*="offer"]').first();
        if ((await btn.count()) > 0 && (await btn.isVisible().catch(() => false))) {
          const readiness = await btn.evaluate(inspectInteractionReadiness, null).catch(() => ({ ready: false }));
          if (!readiness?.ready) continue;
          // Một lần thử input được chốt trước await; không click/evaluate/form.submit lần hai nếu timeout.
          finishOfferCard?.(true);
          finishOfferLink?.(true);
          opened = await humanClick(page || frame.page?.(), btn);
          await markOfferwallCardProcessed(frame, card);
          if (!opened) options.onLog?.({ type: 'offerwall_click_unverified', detail: 'Đã thử bấm offer một lần nhưng chưa xác nhận input; không bấm lại để tránh mở trùng.' }, page);
        }

        if (opened) {
          finishOfferLink?.(true);
          if (!card.hasBtn) await markOfferwallCardProcessed(frame, card);
          openedCount += 1;
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        if (options.orderedCards && !opened) break;
      } catch {} finally { finishOfferCard?.(false); finishOfferLink?.(false); releaseTabSlot?.(); }
    }
  } catch {}
  return openedCount;
}
export { handleOfferwallCards };
