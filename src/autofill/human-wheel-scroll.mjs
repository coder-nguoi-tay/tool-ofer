import { shouldAnimatePageMouse } from './interaction/should-animate-page-mouse.mjs';

/**
 * Cuộn chuột tự nhiên (Mouse Wheel Physics):
 * - Chia cuộn thành các đợt lăn bánh xe giảm tốc (decelerating bursts).
 * - Mô phỏng lăn chuột riêng trên từng tab.
 *
 * @param {object} page Page của Playwright.
 * @param {number} deltaY Quãng đường cuộn theo trục Y.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
async function humanWheelScroll(page, deltaY = 200) {
  if (!shouldAnimatePageMouse(page)) return;
  if (!page?.mouse || typeof page.mouse.wheel !== 'function') return;
  const bursts = Math.max(3, Math.min(5, Math.round(Math.abs(deltaY) / 60)));
  let remaining = deltaY;
  for (let b = 0; b < bursts; b++) {
    const factor = (bursts - b) / bursts;
    const chunk = Math.round(remaining * factor / 2) || (remaining > 0 ? 10 : -10);
    remaining -= chunk;
    await page.mouse.wheel(0, chunk).catch(() => {});
    await new Promise(r => setTimeout(r, Math.floor(Math.random() * 20) + 30));
  }
}
export { humanWheelScroll };
