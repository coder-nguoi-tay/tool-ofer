const attached = new WeakSet();

/**
 * Nhận biết tab đã nối bộ phát cảm ứng native để kiểm tra đích trước khi chạm.
 * @param {object} page Tab đang nhận thao tác.
 * @return {boolean} Tab đang dùng bộ phát cảm ứng của Orbita Android.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export function usesGoLoginAndroidTouchInput(page) {
  return attached.has(page);
}

/**
 * Orbita Android bị treo khi dispatch mousePressed; dùng touch cho nhấn/thả, giữ hover và con trỏ.
 * @param {object} context Context GoLogin của tab.
 * @param {object} page Tab Android cần sửa primitive nhập liệu.
 * @param {object} viewport Kích thước CSS của thiết bị.
 * @return {Promise<void>} Chuột của tab đã nối với input cảm ứng phù hợp Orbita Android.
 * @throws {Error} Khi không tạo được phiên CDP cho tab.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export async function attachGoLoginAndroidTouchInput(context, page, viewport) {
  if (attached.has(page)) return;
  const connection = await context.newCDPSession(page);
  attached.add(page);
  const moveMouse = page.mouse.move.bind(page.mouse);
  let x = viewport.width / 2, y = viewport.height / 2, pressed = false;
  /**
   * Gửi ngón tay hiện tại bằng tọa độ CSS của trang.
   * @param {string} type Pha touchStart/touchMove/touchEnd.
   * @return {Promise<void>} Trình duyệt xác nhận input.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-14
   */
  async function dispatchTouch(type) {
    await connection.send('Input.dispatchTouchEvent', { type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 1, radiusY: 1, force: 1 }] });
  }
  page.mouse.move = async (nextX, nextY, options) => {
    x = nextX; y = nextY;
    if (pressed) await dispatchTouch('touchMove');
    else await moveMouse(x, y, options);
  };
  page.mouse.down = async () => { await dispatchTouch('touchStart'); pressed = true; };
  page.mouse.up = async () => { await dispatchTouch('touchEnd'); pressed = false; };
  page.mouse.wheel = async (deltaX, deltaY) => {
    await connection.send('Input.synthesizeScrollGesture', { x: viewport.width / 2, y: viewport.height / 2,
      xDistance: -deltaX, yDistance: -deltaY, gestureSourceType: 'touch' });
  };
}
