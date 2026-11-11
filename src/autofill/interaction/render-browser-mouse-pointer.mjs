import { updateBrowserMousePointer } from './update-browser-mouse-pointer.mjs';
import { shouldAnimatePageMouse } from './should-animate-page-mouse.mjs';

const pendingRenders = new WeakSet();

/**
 * Hiện vị trí chuột mô phỏng trên từng tab để xem được trong browser và Screen View.
 * Lớp hiển thị không nhận click; chỉ giữ một lệnh vẽ đang chờ cho mỗi tab.
 * Renderer chậm không được giữ thao tác chuột quá 80ms để chờ lớp hiển thị.
 * @param {object} page Tab được gắn slot của phiên.
 * @param {number} x Tọa độ CSS theo viewport main frame.
 * @param {number} y Tọa độ CSS theo viewport main frame.
 * @param {boolean} pressed Chuột đang nhấn để hiển thị màu phản hồi.
 * @param {boolean} track Đăng ký tạo lại con trỏ và theo dõi input trên document hiện tại.
 * @return {Promise<void>} Cập nhật con trỏ nếu trang còn đọc được DOM.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function renderBrowserMousePointer(page, x, y, pressed = false, track = false) {
  if (!shouldAnimatePageMouse(page) || typeof page.evaluate !== 'function' || pendingRenders.has(page)) return;
  pendingRenders.add(page);
  const rendering = Promise.resolve().then(() => page.evaluate(updateBrowserMousePointer, { x, y, pressed, track })).catch(() => {}).finally(() => pendingRenders.delete(page));
  let timer;
  try {
    await Promise.race([rendering, new Promise(resolve => { timer = setTimeout(resolve, 80); })]);
  } finally { clearTimeout(timer); }
}
