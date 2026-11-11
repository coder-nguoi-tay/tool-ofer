/**
 * Đếm số tab phụ đang sống trong context của một page (chỉ định cho điều phối offer con song song).
 *
 * @param {object} page Page Playwright hiện tại.
 * @return {number} Số tab đang mở khác page hiện tại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function countLiveSiblingPages(page) {
  try {
    if (!page?.context) return 0;
    return page.context().pages().filter(p => !p.isClosed() && p !== page).length;
  } catch {
    return 0;
  }
}
export { countLiveSiblingPages };
