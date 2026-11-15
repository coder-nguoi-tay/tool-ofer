import { inspectInteractionReadiness } from '../browser/locators/inspect-interaction-readiness.mjs';
import { clickReadyControl } from '../browser/locators/click-ready-control.mjs';
import { readOfferwallTaskState } from './offerwall/read-offerwall-task-state.mjs';
import { reserveOfferwallCard } from './reserve-offerwall-card.mjs';
import { reserveOfferLink } from '../browser/tabs/reserve-offer-link.mjs';
import { reserveOfferwallTabSlot } from './reserve-offerwall-tab-slot.mjs';
import { MAX_OFFER_TABS } from '../runtime/constants/max-offer-tabs.mjs';
import { isExcludedOfferPageUrl } from '../browser/tabs/is-excluded-offer-page-url.mjs';
import { getOfferUrlState } from '../browser/tabs/get-offer-url-state.mjs';
import { normalizeOfferUrl } from '../browser/tabs/normalize-offer-url.mjs';

const activeFrames = new WeakSet();
const selectedCards = new WeakMap();

/**
 * Xử lý màn "ow-addept" (offer-wall "Take the Deal" — iframe sdk.scrptk.com):
 * - Danh sách task `.unit-card` (các task, data-creative-view-model JSON kèm headline/url).
 * - Bấm 1 task → `.info-panel` hiện CTA (#infoPanelButton) → click CTA → #skipButton để đi tiếp.
 * - Mỗi link CTA chỉ thử một lần trong context, giữ lịch sử qua reload.
 * - Chọn card theo thứ tự hiển thị; mỗi lượt quét chỉ 1 thao tác (throttle 2s).
 *
 * @param {object} page Trang Playwright hiện tại.
 * @param {object} frame Frame đang quét (có thể là iframe scrptk).
 * @param {object} [options={}] Tùy chọn onLog và isCancelled.
 * @return {Promise<number>} Số thao tác đã thực hiện.
 * @throws {never} Lỗi DOM/input được bỏ qua để lượt quét sau thử lại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
async function handleOfferwallTasks(page, frame, options = {}) {
  if (!frame || typeof frame.locator !== 'function' || activeFrames.has(frame) || options.isCancelled?.()) return 0;
  const now = Date.now();
  if (frame._uxOwHandledAt && now - frame._uxOwHandledAt < 2000) return 0;
  frame._uxOwHandledAt = now;
  activeFrames.add(frame);
  let finishCard, finishLink, releaseSlot;
  try {
    const state = await frame.evaluate(readOfferwallTaskState).catch(() => null);
    if (!state || options.isCancelled?.()) return 0;
    if (state.kind === 'waiting') {
      options.onLog?.({ type: 'survey_selection_unverified', detail: 'Đã bấm card; chờ info panel, không bấm lại hoặc vượt sang card sau.' });
      return 0;
    }
    const control = frame.locator(state.selector).first();
    if (!await control.count()) return 0;
    if (state.kind === 'card') {
      finishCard = reserveOfferwallCard(page, state.card);
      if (finishCard === false) { finishCard = null; return 0; }
      if (!finishCard) {
        await control.evaluate(element => element.setAttribute('data-ux-ow-clicked', '1'));
        return 0;
      }
    }
    const readiness = await control.evaluate(inspectInteractionReadiness, frame._activeAutofillFormScope || null).catch(() => ({ ready: false }));
    if (!readiness.ready) {
      options.onLog?.({ type: 'survey_click_failed', detail: 'Task chưa sẵn sàng để click; giữ nguyên thứ tự và chờ lượt sau.' });
      return 0;
    }
    if (options.isCancelled?.()) return 0;
    if (state.kind === 'card') {
      selectedCards.set(frame, state.card);
      await control.evaluate(element => element.setAttribute('data-ux-ow-awaiting-panel', '1'));
    } else if (state.kind === 'cta') {
      const card = selectedCards.get(frame);
      finishCard = card ? reserveOfferwallCard(page, card) : () => {};
      if (finishCard === false) { finishCard = null; return 0; }
      const destination = state.destUrl || card?.destUrl;
      if (!destination || !/^https?:/.test(destination)) return 0;
      finishLink = reserveOfferLink(page, destination);
      if (!finishLink && getOfferUrlState(page.context()).pending.has(normalizeOfferUrl(destination, page.url()))) return 0;
      if (!finishCard || !finishLink || isExcludedOfferPageUrl(destination)) {
        finishCard?.(true);
        await control.evaluate(element => element.setAttribute('data-ux-ow-cta', '1'));
        return 0;
      }
      releaseSlot = reserveOfferwallTabSlot(page, MAX_OFFER_TABS - 1);
      if (!releaseSlot || options.isCancelled?.()) return 0;
      // Chốt trước input: timeout không được phép dẫn tới lần click CTA thứ hai.
      finishCard(true);
      finishLink(true);
      await control.evaluate(element => element.setAttribute('data-ux-ow-cta', '1'));
    }
    if (options.isCancelled?.()) return 0;
    const clicked = await clickReadyControl(control, readiness, page);
    if (!clicked) {
      if (state.kind === 'cta') options.onLog?.({ type: 'ow_task_cta_unverified', detail: '[OW Task] Đã thử CTA nhưng chưa xác nhận input; không bấm lại link.' });
      else options.onLog?.({ type: 'survey_click_failed', detail: 'Task chưa xác nhận input; chờ xác minh trước khi chuyển bước.' });
      return 0;
    }
    if (state.kind === 'card') {
      const shown = await frame.locator('#infoPanel').waitFor({ state: 'visible', timeout: 800 }).then(() => true).catch(() => false);
      if (!shown) {
        options.onLog?.({ type: 'survey_selection_unverified', detail: 'Click task chưa làm hiện info panel; chưa đánh dấu hoàn tất.' });
        return 0;
      }
      await frame.locator('#infoPanelButton').evaluate(element => element.removeAttribute('data-ux-ow-cta')).catch(() => {});
      await control.evaluate(element => element.setAttribute('data-ux-ow-clicked', '1'));
      options.onLog?.({ type: 'ow_task_selected', detail: '[OW Task] Đã chọn task kế tiếp theo thứ tự hiển thị.' });
    } else if (state.kind === 'cta') {
      options.onLog?.({ type: 'ow_task_cta', detail: '[OW Task] Đã thử bấm CTA một lần.' });
    } else {
      selectedCards.delete(frame);
      options.onLog?.({ type: 'ow_task_skip', detail: '[OW Task] Đã bấm Skip để sang task tiếp theo.' });
    }
    return 1;
  } catch { return 0; }
  finally {
    finishCard?.(false);
    finishLink?.(false);
    releaseSlot?.();
    activeFrames.delete(frame);
  }
}
export { handleOfferwallTasks };
