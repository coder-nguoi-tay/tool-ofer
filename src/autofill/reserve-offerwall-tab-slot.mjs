import { countLiveSiblingPages } from './count-live-sibling-pages.mjs';

const pendingOpenings = new WeakMap();

/**
 * Đặt trước chỗ mở offer con trong context để hai tab không cùng vượt trần sau các lệnh await.
 * @param {object|null} page Tab đang mở offerwall.
 * @param {number} maxSiblingTabs Trần tab khác được giữ cùng tab hiện tại.
 * @return {Function|null} Hàm trả chỗ sau khi popup xuất hiện, hoặc null nếu đã hết chỗ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function reserveOfferwallTabSlot(page, maxSiblingTabs) {
  const context = page?.context?.();
  if (!context) return () => {};
  const pending = pendingOpenings.get(context) ?? 0;
  if (countLiveSiblingPages(page) + pending >= maxSiblingTabs) return null;
  pendingOpenings.set(context, pending + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    pendingOpenings.set(context, pendingOpenings.get(context) - 1);
  };
}

/**
 * Kiểm tra popup offer đã đặt chỗ nhưng chưa xuất hiện để tránh đóng phiên giữa lúc mở offer.
 * @param {object} context BrowserContext sở hữu các tab offer.
 * @return {boolean} True nếu còn thao tác mở tab chưa hoàn tất.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function hasPendingOfferwallOpenings(context) {
  return (pendingOpenings.get(context) || 0) > 0;
}
