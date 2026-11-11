/**
 * Cho phép mỗi tab mô phỏng chuột riêng, không phụ thuộc slot hoặc IP.
 * @param {object|null} page Tab đã được gắn slot của phiên autofill.
 * @return {boolean} Tab được phép chạy chuyển động chuột mô phỏng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function shouldAnimatePageMouse(page) {
  return page?._autofillMouseSlot === undefined || page._autofillMouseSlot >= 1;
}
