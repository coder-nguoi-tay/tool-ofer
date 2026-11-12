import { excludedOfferPaths } from './is-excluded-offer-page-url.mjs';

/**
 * Ngăn link/popup bị loại trừ trước khi browser mở tab, kể cả popup redirect trước lúc có frame.
 * @param {Array<Array>} routes Host và path do cấu hình Node truyền vào document.
 * @return {void} Giữ nguyên các lời gọi mở trang khác.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
function blockExcludedPopups(routes) {
  const marker = Symbol.for('autoleadpc.excludedPopupFilter');
  if (window[marker]) return;
  Object.defineProperty(window, marker, { value: true });
  /**
   * So link tuyệt đối/tương đối với danh sách host/path được truyền từ Node.
   * @param {string} value Link cần xét trước khi mở.
   * @return {boolean} True nếu link bị loại trừ.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-12
   */
  const excluded = value => {
    try {
      const url = new URL(value, location.href);
      return ['http:', 'https:'].includes(url.protocol) && routes.some(([host, paths]) => host === url.hostname && paths.includes(url.pathname.replace(/\/+$/, '')));
    } catch { return false; }
  };
  window.open = new Proxy(window.open, {
    /**
     * Chặn popup bị loại trừ, giữ nguyên this/arguments của window.open cho các link khác.
     * @param {Function} target Hàm mở cửa sổ gốc.
     * @param {object} owner Đối tượng gọi window.open.
     * @param {Array} args Tham số mở cửa sổ.
     * @return {object|null} Cửa sổ native hoặc null nếu link bị loại trừ.
     * @author ductv <ductv@getflycrm.com>
     * @since 2026-11-12
     */
    apply(target, owner, args) {
      if (typeof args[0] === 'string' && excluded(args[0])) return null;
      return Reflect.apply(target, owner, args);
    }
  });
  document.addEventListener('click', event => {
    const link = event.target?.closest?.('a[href]');
    if (link && excluded(link.href)) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
}

/**
 * Gắn bộ lọc cho document hiện tại và các lần reload; không cần request tới website bị loại trừ.
 * @param {object} context BrowserContext của phiên.
 * @return {Promise<void>} Hoàn tất đăng ký và áp dụng trên tab đang có.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function installExcludedPopupFilter(context) {
  await context.addInitScript(blockExcludedPopups, excludedOfferPaths);
  await Promise.all(context.pages().map(page => page.evaluate(blockExcludedPopups, excludedOfferPaths).catch(() => {})));
}
