import { chromium } from 'playwright';

/**
 * Kết nối CDP vào Orbita và dừng profile nếu khởi tạo kết nối/context thất bại.
 * @param {Function} startProfile Hàm SDK khởi chạy profile.
 * @param {Function} stopProfile Hàm SDK dừng profile đã khởi chạy.
 * @param {object} hooks Callback cập nhật pha và ghi lỗi trước cleanup.
 * @return {Promise<object>} Profile, kết nối và context mặc định của Orbita.
 * @throws {Error} Khi SDK hoặc CDP không trả tài nguyên hợp lệ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export async function connectGoLoginProfile(startProfile, stopProfile, { onPhase = () => {}, onFailure = () => {} } = {}) {
  let gl, browser;
  try {
    onPhase('sdk_start');
    const started = await startProfile();
    gl = started.gl;
    if (!started.wsUrl) throw new Error('GoLogin không trả WebSocket CDP.');
    onPhase('cdp_connect');
    browser = await chromium.connectOverCDP(started.wsUrl, { timeout: 20000 });
    const context = browser.contexts()[0];
    if (!context) throw new Error('Orbita không có context profile mặc định.');
    return { gl, browser, context, wsUrl: started.wsUrl };
  } catch (error) {
    onFailure(error);
    await browser?.close().catch(() => {});
    if (gl) await stopProfile(gl).catch(() => { error.goLoginStopUnconfirmed = true; });
    throw error;
  }
}
