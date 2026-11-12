import { getOfferUrlState } from '../browser/tabs/get-offer-url-state.mjs';
import { normalizeOfferUrl } from '../browser/tabs/normalize-offer-url.mjs';

/**
 * Khóa định danh offer trước await, giữ cờ đã thử bấm qua reload và các tab cùng trình duyệt/IP.
 * @param {object|null} page Tab offerwall.
 * @param {object} card Định danh và đích của thẻ.
 * @return {Function|null|false} Hàm chốt lần thử; false khi đang xử lý, null khi đã xử lý xong.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function reserveOfferwallCard(page, card) {
  const context = page?.context?.();
  if (!context) return () => {};
  let origin = '';
  try { origin = new URL(card.sourceUrl || page.url()).origin; } catch {}
  const identity = card.offerId ? `id:${card.offerId}` : normalizeOfferUrl(card.destUrl) || (card.actionIdentity ? `action:${card.actionIdentity}:title:${card.title || ''}` : card.title ? `title:${card.title}` : `node:${card.uid}`);
  const key = `offer-card:${origin}:${identity}`;
  const state = getOfferUrlState(context);
  if (state.pending.has(key)) return false;
  if (state.opened.has(key)) return null;
  state.pending.add(key);
  let finalized = false;
  return attempted => {
    if (finalized) return;
    if (attempted) { state.opened.add(key); return; }
    finalized = true;
    state.pending.delete(key);
  };
}
