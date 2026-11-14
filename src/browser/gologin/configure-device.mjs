import { attachGoLoginAndroidTouchInput } from './attach-android-touch-input.mjs';
import { injectOrbitaClientHintHeaders } from './inject-orbita-client-hint-headers.mjs';
import { getGoLoginDeviceSettings } from '../../gologin-profile/get-device-settings.mjs';
import { applyNativeOverrides } from '../../stealth/apply-native-overrides.mjs';
import { buildUserAgentOverride } from '../../stealth/build-user-agent-override.mjs';
import { buildStealthConfig } from '../../stealth/build-stealth-config.mjs';
import { stealthInitScript } from '../../stealth/stealth-init-script.mjs';

/**
 * Máy tính/Android: để Orbita tự lo UA và Client Hints (UA rút gọn X.0.0.0, số build đầy đủ ở mức cao, trùng giữa
 * trang và worker), app chỉ bù header trên redirect bằng đúng giá trị Orbita. iPhone/iPad: Orbita không có chế độ
 * iOS nên app ghi đè UA/màn hình/cảm ứng và xoá Client Hints như Chrome iOS thật.
 * @param {object} session Phiên Orbita có deviceProfile, userAgent, orbitaClientHints và mainPage.
 * @return {Promise<void>} Tab chính đã sẵn sàng; mỗi tab mới có Promise cấu hình dùng lại trước goto.
 * @throws {Error} Khi không áp dụng được cấu hình thiết bị trước khi mở offer.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export async function configureGoLoginDevice(session) {
  const settings = getGoLoginDeviceSettings(session.deviceProfile);
  // Điện thoại dùng biến thể (model/GPU/màn hình/OS) riêng của phiên. Orbita Android khoá Client Hints ở "Android 10", model rỗng
  // cho JS và worker (CDP không đổi được), nên header chỉ bù bằng đúng giá trị Orbita để không lệch.
  const device = session.deviceVariant || settings.profile;
  const mobileViewport = session.mobileScreen ? { width: session.mobileScreen.width, height: session.mobileScreen.height } : device.viewport;
  const mobileScale = session.mobileScreen?.devicePixelRatio || device.deviceScaleFactor;
  let setupPage = async () => {};
  if (settings.appleMobile) {
    const browserVersion = session.userAgent?.match(/CriOS\/([\d.]+)/)?.[1] || String(session._cdpBrowser.version()).match(/\d+(?:\.\d+)+/)?.[0];
    const userAgentOverride = buildUserAgentOverride(device, { version: browserVersion, channel: 'stable' }, ['en-US', 'en']);
    if (session.userAgent) userAgentOverride.userAgent = session.userAgent;
    await session.browser.addInitScript(stealthInitScript, buildStealthConfig(device, {}, session.slot, userAgentOverride.userAgent));
    setupPage = page => applyNativeOverrides(session.browser, page, { userAgentOverride, deviceProfile: device, hardwareConcurrency: device.spoof.hardwareConcurrency });
  } else {
    if (!session.orbitaClientHints) session.addBrowserLog?.({ type: 'gologin_device_error', detail: 'Chưa đọc được Client Hints của Orbita; không bù header cho redirect.' });
    setupPage = async page => {
      if (session.orbitaClientHints) await injectOrbitaClientHintHeaders(session.browser, page, session.orbitaClientHints);
      // Android: Orbita không tự đặt khung nhìn điện thoại khi chạy ngầm; chỉ giả lập màn hình/cảm ứng, không đụng Client Hints.
      if (device.isMobile) await emulateMobileScreen(session.browser, page, { viewport: mobileViewport, deviceScaleFactor: mobileScale, maxTouchPoints: device.spoof.maxTouchPoints });
    };
  }
  const pendingPages = new WeakMap();
  /**
   * Giữ một lượt cấu hình CDP trên mỗi tab để listener và launcher không áp chồng nhau.
   * @param {object} page Tab đang được mở hoặc popup mới.
   * @return {Promise<void>} Cấu hình hoàn tất trước khi launcher điều hướng offer.
   * @throws {Error} Khi CDP từ chối áp dụng thông số thiết bị.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-14
   */
  function prepareDevicePage(page) {
    if (page.isClosed()) return Promise.resolve();
    if (!pendingPages.has(page)) pendingPages.set(page, setupPage(page).then(async () => {
      if (session.isGoLogin && session.deviceProfile === 'android') await attachGoLoginAndroidTouchInput(session.browser, page, mobileViewport);
    }));
    return pendingPages.get(page);
  }
  session.prepareDevicePage = prepareDevicePage;
  session.browser.on('page', page => {
    void prepareDevicePage(page).catch(() => {
      if (!page.isClosed()) session.addBrowserLog?.({ type: 'gologin_device_error', detail: 'Không áp được cấu hình thiết bị cho tab mới.' }, page);
    });
  });
  await Promise.all(session.browser.pages().map(prepareDevicePage));
}

/**
 * Đặt khung nhìn, tỉ lệ điểm ảnh và cảm ứng của điện thoại cho một tab.
 * @param {object} context Context Orbita.
 * @param {object} page Tab cần giả lập.
 * @param {object} screen Khung nhìn CSS, tỉ lệ điểm ảnh và số điểm chạm của thiết bị.
 * @return {Promise<void>} CDP đã áp kích thước và cảm ứng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function emulateMobileScreen(context, page, { viewport, deviceScaleFactor, maxTouchPoints }) {
  const connection = await context.newCDPSession(page);
  const { width, height } = viewport;
  await connection.send('Emulation.setDeviceMetricsOverride', { width, height, screenWidth: width, screenHeight: height,
    deviceScaleFactor, mobile: true });
  await connection.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints });
}
