import { humanMouseMove } from './human-mouse-move.mjs';
import { shouldAnimatePageMouse } from './interaction/should-animate-page-mouse.mjs';

/**
 * Vi chuyển động chuột tự nhiên khi nhàn rỗi (Natural Mouse Idle Drift):
 * - Mô phỏng độ rung tay hoặc di chuyển vu vơ khi người dùng đọc câu hỏi hoặc chờ trang tải.
 * - Quãng đường ngắn 12px - 35px, không giật lag.
 * - Mỗi tab giữ vị trí và chuyển động chuột riêng.
 *
 * @param {object} page Page của Playwright.
 * @param {number} [count=1] Số lần trôi chuột.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
async function naturalMouseDrift(page, count = 1) {
  if (!shouldAnimatePageMouse(page)) return;
  if (!page?.mouse || typeof page.mouse.move !== 'function') return;
  if (!page._lastMousePos) {
    page._lastMousePos = {
      x: Math.floor(Math.random() * 200) + 150,
      y: Math.floor(Math.random() * 150) + 150
    };
  }
  for (let c = 0; c < count; c++) {
    const angle = Math.random() * 2 * Math.PI;
    const distance = Math.floor(Math.random() * 22) + 12; // 12px - 34px
    const targetX = Math.max(20, Math.min(1200, Math.round(page._lastMousePos.x + Math.cos(angle) * distance)));
    const targetY = Math.max(20, Math.min(800, Math.round(page._lastMousePos.y + Math.sin(angle) * distance)));
    await humanMouseMove(page, targetX, targetY);
    await new Promise(r => setTimeout(r, Math.floor(Math.random() * 50) + 50));
  }
}
export { naturalMouseDrift };
