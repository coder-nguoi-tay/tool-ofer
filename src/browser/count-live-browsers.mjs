import { activeBrowsers } from './sessions.mjs';

/**
 * Đếm phiên trình duyệt còn chạy thật để tính mục tiêu khi người dùng bấm Start.
 *
 * Không dùng activeBrowsers.size: sau Stop/đóng, phiên đang đóng (isClosed) hoặc đã mất kết nối vẫn còn trong tập
 * một lúc (Obscura chưa xác nhận thoát còn được thêm lại). Start ngay lúc đó làm mục tiêu thành "số phiên chết + N",
 * rồi lượt bù dọn phiên chết và mở hàng loạt vượt số người dùng chọn (lỗi 2026-11-18: chọn 1 mà mở 10 slot/lượt).
 * @return {number} Số phiên chưa đóng và còn kết nối.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
export function countLiveBrowsers() {
  let count = 0;
  for (const session of activeBrowsers) {
    if (session.isClosed) continue;
    if (session.isObscuraProcessAlive?.()) {
      count++;
      continue;
    }
    if (typeof session.browser?.isClosed === 'function' && session.browser.isClosed()) continue;
    if (typeof session.browser?.isConnected === 'function' && !session.browser.isConnected()) continue;
    if (session.isManagedProfile && session._cdpBrowser && !session._cdpBrowser.isConnected()) continue;
    count++;
  }
  return count;
}

/**
 * Lấy danh sách các phiên trình duyệt còn sống thật sự.
 * @return {Array<object>} Danh sách phiên chưa đóng và còn kết nối.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
export function getLiveBrowsers() {
  const live = [];
  for (const session of activeBrowsers) {
    if (session.isClosed) continue;
    if (session.isObscuraProcessAlive?.()) {
      live.push(session);
      continue;
    }
    if (typeof session.browser?.isClosed === 'function' && session.browser.isClosed()) continue;
    if (typeof session.browser?.isConnected === 'function' && !session.browser.isConnected()) continue;
    if (session.isManagedProfile && session._cdpBrowser && !session._cdpBrowser.isConnected()) continue;
    live.push(session);
  }
  return live;
}
