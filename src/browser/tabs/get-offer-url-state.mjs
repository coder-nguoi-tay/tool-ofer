const contexts = new WeakMap();

/**
 * Giữ lịch sử và khóa link riêng cho từng trình duyệt/IP, độc lập với DOM sau reload.
 * @param {object} context BrowserContext sở hữu các tab.
 * @return {object} Link đã mở, đang mở và tab sở hữu mỗi link.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function getOfferUrlState(context) {
  if (!contexts.has(context)) contexts.set(context, { opened: new Set(), pending: new Set(), owners: new Map() });
  return contexts.get(context);
}
