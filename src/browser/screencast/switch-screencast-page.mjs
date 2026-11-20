import { attachScreencastSession } from './attach-screencast-session.mjs';
import { releaseScreencast } from './release-screencast.mjs';

/**
 * Gắn nguồn ảnh nếu lượt chọn vẫn mới nhất, dọn đúng CDP khi lượt chọn hết hiệu lực.
 * @param {object} stream Kết nối Screen View hiện tại.
 * @param {symbol} selection Lượt chọn đã ghi nhận trước khi thao tác tab.
 * @param {object} session Phiên trình duyệt sở hữu tab.
 * @param {import('playwright').Page} page Tab cần hiển thị.
 * @param {number} slot Slot của phiên.
 * @return {Promise<boolean>} True khi tab vẫn là nguồn được chọn.
 * @throws {Error} Khi trình duyệt từ chối tạo phiên CDP.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export async function switchScreencastPage(stream, selection, session, page, slot) {
  if (stream.cleaned || stream.viewSelection !== selection) return false;
  const viewer = await session.browser.newCDPSession(page);
  if (stream.cleaned || stream.viewSelection !== selection || page.isClosed()) {
    void viewer.detach().catch(() => {});
    return false;
  }
  // release tháo listener đồng bộ rồi chỉ dọn CDP cũ ở nền.
  void releaseScreencast(stream).catch(() => {});
  await attachScreencastSession(stream, viewer, page, slot, session);
  return !stream.cleaned && stream.viewSelection === selection && stream.cdpClient === viewer;
}
