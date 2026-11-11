/**
 * Tìm các tab trùng link (bỏ phần #hash) với một tab khác đang mở: giữ tab gốc / tab mở trước,
 * trả về tab trùng cần đóng. Tab gốc (tab chính + tab app tự mở) không bao giờ nằm trong kết quả,
 * vì chế độ đa tab cố ý mở cùng một link ở nhiều tab gốc.
 *
 * @param {object[]} pages Các tab của phiên, theo thứ tự mở.
 * @param {(page: object) => boolean} isOrigin Tab có phải tab gốc không.
 * @return {object[]} Các tab trùng link cần đóng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function findDuplicateTabs(pages, isOrigin) {
  const linkOf = page => {
    const url = String(page.url?.() || '');
    return /^https?:/i.test(url) ? url.split('#')[0] : '';
  };
  const open = pages.filter(p => !p.isClosed?.() && linkOf(p));
  const seen = new Set(open.filter(isOrigin).map(linkOf));
  const duplicates = [];
  for (const page of open) {
    if (isOrigin(page)) continue;
    const link = linkOf(page);
    if (seen.has(link)) duplicates.push(page);else seen.add(link);
  }
  return duplicates;
}
