/**
 * Gắn tầng mô phỏng hành vi người thật (CloakBrowser Humanize) vào một Playwright BrowserContext.
 * Tự động biến đổi click, type, fill, scroll thành quỹ đạo Bezier mượt mà với độ trễ phím ngẫu nhiên.
 *
 * @param {object} context Đối tượng Playwright BrowserContext
 * @param {string} [preset='default'] Bộ cấu hình humanize ('default' hoặc 'careful')
 * @return {Promise<boolean>} True nếu gắn thành công
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function applyCloakHumanize(context, preset = 'default') {
  if (!context) return false;
  try {
    // CloakBrowser chỉ export subpath "." , "./puppeteer" và "./human".
    // resolveConfig nằm trong barrel "./human" — import "./human/config.js" sẽ ném
    // ERR_PACKAGE_PATH_NOT_EXPORTED vì package không khai báo subpath đó.
    const {
      patchContext,
      resolveConfig
    } = await import('cloakbrowser/human');
    const cfg = resolveConfig(preset);
    patchContext(context, cfg);
    // patchContext() trả về undefined; dấu hiệu thành công là cờ _humanPatched do
    // chính thư viện set. Không kiểm tra cờ này thì lỗi bị báo cáo là "thành công".
    if (context._humanPatched !== true) {
      console.warn('[CloakBrowser] Humanize layer không được gắn (patchContext không đặt cờ _humanPatched).');
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[CloakBrowser] Không thể áp dụng Humanize layer: ${err.message}`);
    return false;
  }
}
export { applyCloakHumanize };
