import { updateBrowserMousePointer } from './update-browser-mouse-pointer.mjs';
import { renderBrowserMousePointer } from './render-browser-mouse-pointer.mjs';

const trackedPages = new WeakSet();

/**
 * Gắn con trỏ cho trang hiện tại và mọi lần reload/điều hướng, kể cả trước khi autofill bắt đầu.
 * @param {object} page Tab Playwright cần con trỏ độc lập.
 * @return {void} Đăng ký một lần cho tab; không đợi renderer hoặc làm chậm quét form.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function attachBrowserMousePointer(page) {
  if (!page?.mouse || typeof page.addInitScript !== 'function' || trackedPages.has(page)) return;
  trackedPages.add(page);
  page._lastMousePos ??= { x: 24, y: 24 };
  void page.addInitScript(updateBrowserMousePointer, { x: 24, y: 24, track: true }).catch(() => {});
  const show = () => { void renderBrowserMousePointer(page, page._lastMousePos?.x ?? 24, page._lastMousePos?.y ?? 24, false, true); };
  page.on?.('domcontentloaded', show);
  show();
}
