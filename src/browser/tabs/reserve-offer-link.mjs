import { getOfferUrlState } from './get-offer-url-state.mjs';
import { normalizeOfferUrl } from './normalize-offer-url.mjs';

/**
 * Khóa link trước await để các tab/frame không cùng mở lại một offer khi DOM được dựng lại.
 * @param {object|null} page Tab offerwall.
 * @param {string} destination Link đích của thẻ.
 * @return {Function|null} Hàm hoàn tất nhận cờ đã mở, hoặc null nếu link đã/đang mở.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function reserveOfferLink(page, destination) {
  const context = page?.context?.();
  const key = destination ? normalizeOfferUrl(destination, page?.url?.()) : '';
  if (!context || !key) return () => {};
  const state = getOfferUrlState(context);
  if (state.opened.has(key) || state.pending.has(key)) return null;
  state.pending.add(key);
  let finished = false;
  return opened => {
    if (finished) return;
    finished = true;
    state.pending.delete(key);
    if (opened) state.opened.add(key);
  };
}
