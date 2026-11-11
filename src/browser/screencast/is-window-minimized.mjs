/**
 * Cửa sổ chứa tab có đang thu nhỏ không (chạy ẩn).
 * Đo thực tế: captureScreenshot treo vĩnh viễn trên cửa sổ thu nhỏ VÀ chặn luôn screencast của tab
 * (62.7 → 0.3 FPS), trong khi screencast tự nó vẫn ~60 FPS và vẫn gửi frame đầu cho trang tĩnh.
 *
 * @param {import('playwright').CDPSession} cdp
 * @return {Promise<boolean>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function isWindowMinimized(cdp) {
  try {
    const {
      bounds
    } = await cdp.send('Browser.getWindowForTarget');
    return bounds?.windowState === 'minimized';
  } catch {
    return false;
  }
}
export { isWindowMinimized };
