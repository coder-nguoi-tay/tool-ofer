import { hideWindowOffscreen } from '../actions/hide-window-offscreen.mjs';
import { suppressBringToFrontWhileHidden } from '../window/suppress-bring-to-front-while-hidden.mjs';

const configured = new WeakSet();

/**
 * Giữ phiên chạy trong app ở headless; headful ẩn tới lead theo dõi cả cửa sổ popup mới.
 * @param {object} session Phiên đã có context và mainPage.
 * @param {boolean} hidden Lựa chọn ẩn cửa sổ Desktop.
 * @return {Promise<void>} Gắn điều khiển cửa sổ, ghi lỗi ẩn/hiện vào log quan trọng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export async function configureGoLoginWindow(session, hidden) {
  if (configured.has(session.browser)) return;
  configured.add(session.browser);
  session.runHidden = hidden;
  if (session.trueHeadless) {
    session.runHidden = true; session.isWindowVisible = false;
    session.showWindow = async () => false;
    session.hideWindow = async () => true;
    suppressBringToFrontWhileHidden(session.browser, session);
    // Chạy ngầm mặc định cửa sổ 800x600 (dấu hiệu headless kinh điển) và Orbita bỏ qua --window-size;
    // máy tính đặt cửa sổ đầy vùng màn hình khả dụng, điện thoại đã có khung nhìn riêng.
    if (!['android', 'ios', 'ipad'].includes(session.deviceProfile)) {
      session.browser.on('page', page => { void fitHeadlessWindowToScreen(session.browser, page); });
      await fitHeadlessWindowToScreen(session.browser, session.mainPage);
    }
    return;
  }
  /**
   * Đổi trạng thái một cửa sổ, phục hồi tọa độ hợp lệ khi hiện và nhả CDP tạm.
   * @param {object} page Tab thuộc cửa sổ cần xử lý.
   * @param {boolean} visible Có hiển thị trên Desktop hay không.
   * @return {Promise<boolean>} True khi CDP xác nhận trạng thái.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-14
   */
  async function setVisibility(page, visible) {
    let connection;
    try {
      connection = await session.browser.newCDPSession(page);
      const { windowId } = await connection.send('Browser.getWindowForTarget');
      if (visible) {
        await connection.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
        await connection.send('Browser.setWindowBounds', { windowId, bounds: { left: 80, top: 80 } });
        session.runHidden = false; session.isWindowVisible = true; session.hasShownWindow = true;
        await page.bringToFront();
      } else {
        await hideWindowOffscreen(connection, windowId);
        session.runHidden = true; session.isWindowVisible = false;
      }
      session.windowVisibilityError = null;
      return true;
    } catch (error) {
      session.windowVisibilityError = error.name;
      session.isWindowVisible = null;
      if (!page.isClosed()) session.addBrowserLog?.({ type: 'window_visibility_error', errorName: error.name, detail: visible ? 'Không hiện được cửa sổ Orbita.' : 'Không ẩn được cửa sổ Orbita; không coi là đã ẩn thành công.' });
      return false;
    } finally { await connection?.detach().catch(() => {}); }
  }
  session.showWindow = () => setVisibility(session.mainPage, true);
  session.hideWindow = () => setVisibility(session.mainPage, false);
  suppressBringToFrontWhileHidden(session.browser, session);
  session.browser.on('page', page => { if (session.runHidden) void setVisibility(page, false); });
  await setVisibility(session.mainPage, !hidden);
}

/**
 * Đặt cửa sổ chạy ngầm bằng vùng màn hình khả dụng (screen.availWidth/availHeight) như cửa sổ phóng to.
 * @param {object} context Context Orbita.
 * @param {object} page Tab thuộc cửa sổ cần chỉnh.
 * @return {Promise<void>} Lỗi được bỏ qua vì chỉ ảnh hưởng kích thước, không chặn phiên.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function fitHeadlessWindowToScreen(context, page) {
  let connection;
  try {
    connection = await context.newCDPSession(page);
    const { windowId } = await connection.send('Browser.getWindowForTarget');
    const { result } = await connection.send('Runtime.evaluate', { expression: '[screen.availWidth, screen.availHeight, screen.availLeft || 0, screen.availTop || 0]', returnByValue: true });
    const [width, height, left, top] = result.value;
    await connection.send('Browser.setWindowBounds', { windowId, bounds: { left, top, width, height } });
  } catch {} finally { await connection?.detach().catch(() => {}); }
}
