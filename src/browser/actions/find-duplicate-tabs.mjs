import { normalizeOfferUrl } from '../tabs/normalize-offer-url.mjs';
/**
 * Tìm các tab trùng link (bỏ phần #hash) với một tab khác đang mở: giữ tab gốc / tab mở trước,
 * trả về tab trùng cần đóng. Tab chính được ưu tiên giữ; tab gốc mở trùng vẫn nằm trong kết quả.
 *
 * @param {object[]} pages Các tab của phiên, theo thứ tự mở.
 * @param {(page: object) => boolean} isOrigin Tab có phải tab gốc không.
 * @return {object[]} Các tab trùng link cần đóng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function findDuplicateTabs(pages, isOrigin) {
  const open = pages.filter(page => !page.isClosed?.() && normalizeOfferUrl(page.url?.()));
  const ordered = [...open.filter(isOrigin), ...open.filter(page => !isOrigin(page))];
  const seen = new Set();
  return ordered.filter(page => {
    const key = normalizeOfferUrl(page.url());
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });
}
