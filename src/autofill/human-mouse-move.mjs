import { shouldAnimatePageMouse } from './interaction/should-animate-page-mouse.mjs';
import { renderBrowserMousePointer } from './interaction/render-browser-mouse-pointer.mjs';

/**
 * Di chuyển chuột theo đường cong Bézier bậc 3 mô phỏng chuyển động tay người:
 * - Gia tốc ban đầu (ease-in), lướt nhanh ở giữa và giảm tốc khi tới gần đích (ease-out).
 * - Control points có độ lệch ngẫu nhiên và vi rung lắc (micro-jitter).
 * - Dùng input trình duyệt và hiển thị đường rê trên từng tab được điều khiển.
 *
 * @param {object} page Page của Playwright.
 * @param {number} targetX Toạ độ X đích.
 * @param {number} targetY Toạ độ Y đích.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
async function humanMouseMove(page, targetX, targetY) {
  if (!shouldAnimatePageMouse(page)) return;
  if (!page?.mouse || typeof page.mouse.move !== 'function') return;
  if (!page._lastMousePos) {
    page._lastMousePos = {
      x: Math.floor(Math.random() * 200) + 100,
      y: Math.floor(Math.random() * 150) + 100
    };
  }
  const startX = page._lastMousePos.x;
  const startY = page._lastMousePos.y;
  const distance = Math.hypot(targetX - startX, targetY - startY);
  if (distance < 3) {
    await page.mouse.move(targetX, targetY).catch(() => {});
    await renderBrowserMousePointer(page, targetX, targetY);
    page._lastMousePos = {
      x: targetX,
      y: targetY
    };
    return;
  }
  const steps = Math.min(22, Math.max(7, Math.round(distance / 28)));
  const dx = targetX - startX;
  const dy = targetY - startY;
  const normalX = -dy / distance;
  const normalY = dx / distance;
  const curvature = (Math.random() - 0.5) * Math.min(distance * 0.35, 70);
  const cp1X = startX + dx * 0.25 + normalX * curvature + (Math.random() - 0.5) * 12;
  const cp1Y = startY + dy * 0.25 + normalY * curvature + (Math.random() - 0.5) * 12;
  const cp2X = startX + dx * 0.75 + normalX * curvature * 0.5 + (Math.random() - 0.5) * 12;
  const cp2Y = startY + dy * 0.75 + normalY * curvature * 0.5 + (Math.random() - 0.5) * 12;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const easedT = t * t * (3 - 2 * t);
    const u = 1 - easedT;
    const x = u * u * u * startX + 3 * u * u * easedT * cp1X + 3 * u * easedT * easedT * cp2X + easedT * easedT * easedT * targetX;
    const y = u * u * u * startY + 3 * u * u * easedT * cp1Y + 3 * u * easedT * easedT * cp2Y + easedT * easedT * easedT * targetY;
    const jitter = i < steps ? (Math.random() - 0.5) * 1.5 : 0;
    await page.mouse.move(Math.round(x + jitter), Math.round(y + jitter)).catch(() => {});
    await renderBrowserMousePointer(page, Math.round(x + jitter), Math.round(y + jitter));
  }
  await page.mouse.move(targetX, targetY).catch(() => {});
  await renderBrowserMousePointer(page, targetX, targetY);
  page._lastMousePos = {
    x: targetX,
    y: targetY
  };
}
export { humanMouseMove };
