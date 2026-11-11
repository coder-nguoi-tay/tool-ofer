import { inspectInteractionReadiness } from '../browser/locators/inspect-interaction-readiness.mjs';
import { resolveVisibleControlLabel } from '../browser/locators/resolve-visible-control-label.mjs';
import { scrollToFormControl } from './form-scope/scroll-to-form-control.mjs';
import { humanMouseMove } from './human-mouse-move.mjs';
import { shouldAnimatePageMouse } from './interaction/should-animate-page-mouse.mjs';
import { renderBrowserMousePointer } from './interaction/render-browser-mouse-pointer.mjs';

/**
 * Click qua input trình duyệt với quỹ đạo và nhịp nhấn chuột mô phỏng trên mọi slot.
 * - Tìm toạ độ bounding box thật của phần tử.
 * - Di chuyển chuột mượt theo đường cong Bézier (humanMouseMove) tới điểm ngẫu nhiên bên trong phần tử.
 * - Nghỉ ngắn tiền phản xạ (pre-dwell: 30ms - 70ms).
 * - Nhấn chuột xuống (mouse.down).
 * - Giữ chuột (hold click: 55ms - 105ms) mô phỏng lực ấn nút của ngón tay người.
 * - Thả chuột (mouse.up).
 * - Fallback an toàn nếu phần tử ẩn, boundingBox rỗng hoặc môi trường unit test.
 *
 * @param {object} page Page của Playwright.
 * @param {object} target Locator hoặc ElementHandle cần click.
 * @return {Promise<boolean>} True khi đã dispatch click qua input trình duyệt.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
async function humanClick(page, target) {
  if (!target) return false;
  const activePage = page || (typeof target?.page === 'function' ? target.page() : null);
  if (typeof target.evaluate === 'function') {
    const readiness = await target.evaluate(inspectInteractionReadiness, null, { timeout: 300 }).catch(() => ({ ready: false }));
    if (!readiness?.ready) return false;
    if (readiness.useLabel) {
      const labelHandle = await resolveVisibleControlLabel(target);
      try {
        const label = labelHandle?.asElement();
        return label ? await humanClick(activePage, label) : false;
      } finally { await labelHandle?.dispose().catch(() => {}); }
    }
  }
  try {
    if (typeof target.scrollIntoViewIfNeeded === 'function') await scrollToFormControl(target);
    if (shouldAnimatePageMouse(activePage) && activePage?.mouse && typeof target.boundingBox === 'function') {
      const box = await target.boundingBox().catch(() => null);
      if (box && box.width > 0 && box.height > 0) {
        const clickX = box.x + box.width * (0.2 + 0.6 * Math.random());
        const clickY = box.y + box.height * (0.2 + 0.6 * Math.random());
        await humanMouseMove(activePage, clickX, clickY);
        const preDwell = Math.floor(Math.random() * 40) + 30;
        await new Promise(r => setTimeout(r, preDwell));
        let pressed = false;
        try {
          await renderBrowserMousePointer(activePage, clickX, clickY, true);
          await activePage.mouse.down();
          pressed = true;
          const holdDuration = Math.floor(Math.random() * 50) + 55;
          await new Promise(r => setTimeout(r, holdDuration));
          await activePage.mouse.up();
          pressed = false;
        } finally {
          if (pressed) await activePage.mouse.up().catch(() => {});
          await renderBrowserMousePointer(activePage, clickX, clickY, false);
        }
        return true;
      }
    }
  } catch {}

  // Giữ click dự phòng của Playwright khi không lấy được tọa độ.
  try {
    if (typeof target.click === 'function') {
      await target.click({
        force: false,
        timeout: 2000
      });
      return true;
    }
  } catch {}
  return false;
}
export { humanClick };
