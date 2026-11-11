import { activeBrowsers } from '../sessions.mjs';
import { screencastSessions } from '../../runtime/constants/screencast-sessions.mjs';

/**
 * Chọn đúng tab đang xem của slot, không mở bản sao URL hoặc thay đổi phiên/proxy.
 * @param {number} slot Slot người dùng đang kiểm tra.
 * @return {object|null} Page hiện tại hoặc null khi phiên đã đóng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function resolveDebugPage(slot) {
  const session = [...activeBrowsers].find(item => !item.isClosed && (item.slot ?? item.tileIndex + 1) === slot);
  if (!session) return null;
  const pages = session.browser.pages().filter(item => !item.isClosed());
  const page = screencastSessions.get(slot)?.page;
  if (pages.includes(page)) return page;
  return pages.includes(session.mainPage) ? session.mainPage : pages[0] || null;
}
