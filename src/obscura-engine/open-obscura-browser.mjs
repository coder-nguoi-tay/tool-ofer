import { pendingObscuraSessions } from './sessions.mjs';
import { chromium } from 'playwright';
import { createFreshObscuraProfile } from './create-fresh-profile.mjs';
import { attachStylesheetDiagnostics } from './attach-stylesheet-diagnostics.mjs';
import { startObscuraSession } from './start-obscura-session.mjs';
import { stopObscuraSession } from './stop-obscura-session.mjs';
import { findFreePort } from './find-free-port.mjs';
import { activeBrowsers } from '../browser/sessions.mjs';
import { localeForCountry } from '../stealth/locale-for-country.mjs';
import { buildClientHintHeaders } from '../stealth/build-client-hint-headers.mjs';

/**
 * Chọn profile TLS/HTTP2 của engine khớp thiết bị: Safari cho iPhone/iPad, Chrome theo nền tảng cho máy còn lại.
 * @param {object} profile Profile Obscura (is_safari_ios, platform, client_hints).
 * @return {string} Giá trị AUTOLEADPC_OBSCURA_TLS_PROFILE mà engine hiểu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-17
 */
export function obscuraTlsProfile(profile) {
  if (profile.is_safari_ios) return profile.platform === 'iPad' ? 'safari-ipad' : 'safari-ios';
  const platform = String(profile.client_hints?.platform || profile.platform || '');
  if (/android/i.test(platform)) return 'chrome-android';
  if (/mac/i.test(platform)) return 'chrome-macos';
  if (/linux/i.test(platform)) return 'chrome-linux';
  return 'chrome-windows';
}

/**
 * Vùng nội dung (innerWidth/innerHeight) như trình duyệt thật: nhỏ hơn màn hình đúng phần thanh tab/địa chỉ/taskbar.
 * Trước đây viewport bằng cả màn hình nên innerHeight > outerHeight, điều không thể có ở trình duyệt thật.
 * @param {object} profile Profile Obscura (screen, is_mobile, is_safari_ios, platform).
 * @return {{width: number, height: number}} Kích thước viewport.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
export function obscuraViewport(profile) {
  const { screen } = profile;
  if (profile.is_safari_ios) return { width: screen.width, height: screen.height - (profile.platform === 'iPad' ? 74 : 193) };
  if (profile.is_mobile) return { width: screen.width, height: screen.height - 128 };
  return { width: screen.avail_width || screen.width, height: (screen.avail_height || screen.height) - 87 };
}

/**
 * Khởi tạo engine Obscura độc lập; cung cấp một hàm đóng idempotent và khôi phục CDP khi process còn sống.
 * @param {object} options Slot, proxy, seed, OS, geo và tùy chọn đăng ký phiên/URL fixture.
 * @return {Promise<object>} Phiên có BrowserContext, kết nối CDP và điều khiển vòng đời engine.
 * @throws {Error} Khi binary, proxy, cấu hình hoặc kết nối CDP thất bại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
export async function openObscuraBrowser({ slot = 1, port = null, seed = null, os = 'windows', proxy = null,
  targetUrl = null, geo = null, registerSession = true, antiFingerprint = {}, startupSession = null, previousIdentity = null } = {}) {
  const deviceOs = ({ macos: 'mac', ios: 'iphone', win: 'windows' })[os] || os;
  const { seed: profileSeed, profile } = createFreshObscuraProfile({ seed, os: deviceOs, previousIdentity });
  const deviceVersion = profile.is_safari_ios ? profile.os : profile.platform;
  if (geo?.timezone) profile.timezone = geo.timezone;
  if (geo?.country) profile.languages = [localeForCountry(geo.country).locale, 'en'];
  const hints = profile.client_hints;
  const metadata = hints ? { ...hints, platformVersion: hints.platform_version, fullVersion: profile.chrome_version,
    fullVersionList: hints.brands.map(brand => ({ ...brand, version: brand.brand.includes('Not') ? brand.version : profile.chrome_version })) } : null;
  // Chrome chỉ tự gửi 3 Client Hints entropy thấp; bitness/arch/model/platform-version chỉ có khi server xin qua
  // Accept-CH. Gửi sẵn trên mọi request là dấu hiệu bot (đo qua tls.peet.ws 2026-11-17).
  // ponytail: chưa xử lý Accept-CH, site xin high-entropy qua header sẽ không nhận được; JS getHighEntropyValues vẫn đủ.
  const headers = metadata ? Object.fromEntries(Object.entries(buildClientHintHeaders(metadata))
    .filter(([name]) => /^sec-ch-ua(-mobile|-platform)?$/i.test(name))) : {};
  headers['user-agent'] = profile.user_agent;
  headers['accept-language'] = profile.languages.join(',');
  let proxyUrl = typeof proxy === 'string' ? proxy : proxy?.server;
  if (proxy?.username) {
    const address = new URL(proxyUrl);
    address.username = proxy.username; address.password = proxy.password || '';
    proxyUrl = address.toString();
  }
  let startingChild, startingClose;
  const startingSession = Object.assign(startupSession || {}, {
    isObscura: true, engine: 'obscura', slot, tileIndex: slot - 1,
    /**
     * Dừng child đang chờ CDP, trước khi có BrowserContext hoặc phiên active.
     * @return {Promise<void>} Child đã kết thúc.
     * @throws {Error} Khi không xác nhận được process dừng.
     * @author ductv <ductv@getflycrm.com>
     * @since 2026-11-17
     */
    close() {
      return startingClose ||= stopObscuraSession(startingChild).then(async () => {
        pendingObscuraSessions.delete(startingSession);
        activeBrowsers.delete(startingSession);
        await startingSession.onClosed?.();
      }).catch(error => { startingClose = null; throw error; });
    },
    /**
     * Giữ tài nguyên của child khởi tạo nếu Stop chưa xác nhận được exit.
     * @return {boolean} True khi child chưa thoát.
     * @author ductv <ductv@getflycrm.com>
     * @since 2026-11-17
     */
    isObscuraProcessAlive() { return Boolean(startingChild && startingChild.exitCode === null && startingChild.signalCode === null); },
  });
  let browser, startupRecord, engine;
  try {
    engine = await startObscuraSession({ port: await findFreePort(port ?? 9220 + slot), proxy: proxyUrl,
      timezone: profile.timezone, userAgent: profile.user_agent, headers,
      tlsProfile: obscuraTlsProfile(profile), identity: { ...profile, seed: String(profileSeed), public_ip: geo?.ip || null, anti_fingerprint: antiFingerprint,
        geolocation: geo?.ll?.length === 2 ? { latitude: geo.ll[0], longitude: geo.ll[1] } : null },
      onSpawn: child => { startingChild = child; pendingObscuraSessions.add(startingSession); },
    });
    browser = await chromium.connectOverCDP(engine.cdpEndpoint, { timeout: 15000 });
    const context = browser.contexts()[0] || await browser.newContext();
    const page = context.pages()[0] || await context.newPage();
    let closing = null, reconnecting = null;
    const configuredContexts = new WeakSet();
    const session = Object.assign(startupSession || {}, {
      slot, tileIndex: slot - 1, engine: 'obscura', browserType: 'obscura', isObscura: true, isManagedProfile: true,
      profileId: `obscura_${engine.pid}`, profile, chromeVersion: profile.chrome_version,
      deviceProfile: deviceOs, requestedDeviceProfile: os, deviceVersion, deviceSummary: `${deviceVersion} · Obscura`,
      port: engine.port, browserWebSocketUrl: engine.cdpEndpoint, browser: context, context,
      _cdpBrowser: browser, page, mainPage: page, process: engine.process, pid: engine.pid,
      websiteUrl: targetUrl || 'about:blank', isWindowVisible: false, trueHeadless: true,
      createdAt: new Date().toISOString(), bandwidthBytes: 0, bytesSent: 0, bytesReceived: 0, requestCount: 0,
      /**
       * Kiểm tra process đúng phiên, không dùng cờ killed thay cho xác nhận đã thoát.
       * @return {boolean} True khi tiến trình chưa có exit code hoặc signal.
       * @author ductv <ductv@getflycrm.com>
       * @since 2026-11-17
       */
      isObscuraProcessAlive() { return engine.process.exitCode === null && engine.process.signalCode === null; },
      /**
       * Đồng bộ trạng thái badge hiển thị trong giao diện app.
       * @param {string} text Nội dung badge.
       * @return {void}
       * @author ductv <ductv@getflycrm.com>
       * @since 2026-11-17
       */
      updateBadge(text) { session.badgeText = text; },
      /**
       * Gắn thiết bị, listener và chẩn đoán CSS tùy chọn vào mỗi context, kể cả sau reconnect.
       * @param {object} currentContext BrowserContext đang điều khiển.
       * @return {Promise<void>} Context đã có script và header trước điều hướng.
       * @throws {Error} Khi CDP không áp được cấu hình thiết bị.
       * @author ductv <ductv@getflycrm.com>
       * @since 2026-11-17
       */
      async configureContext(currentContext) {
        if (configuredContexts.has(currentContext)) return;
        await currentContext.setExtraHTTPHeaders(headers);
        /**
         * Đặt danh tính mạng và viewport cho tab trước điều hướng.
         * @param {object} currentPage Tab thuộc context hiện tại.
         * @return {Promise<void>} CDP đã áp cấu hình và được nhả.
         * @throws {Error} Khi không cấu hình được tab.
         * @author ductv <ductv@getflycrm.com>
         * @since 2026-11-17
         */
        session.prepareDevicePage = async currentPage => {
          const cdp = await currentContext.newCDPSession(currentPage);
          try {
            await cdp.send('Network.setUserAgentOverride', { userAgent: profile.user_agent, acceptLanguage: profile.languages.join(','), userAgentMetadata: metadata });
            const viewport = obscuraViewport(profile);
            await currentPage.setViewportSize(viewport);
            await cdp.send('Emulation.setDeviceMetricsOverride', { ...viewport, mobile: profile.is_mobile,
              screenWidth: profile.screen.width, screenHeight: profile.screen.height, deviceScaleFactor: profile.screen.device_pixel_ratio });
            if (geo?.ll?.length === 2 && antiFingerprint?.apiFakeIP !== false) {
              await cdp.send('Emulation.setGeolocationOverride', {
                latitude: Number(geo.ll[0]),
                longitude: Number(geo.ll[1]),
                accuracy: 100,
              }).catch(() => {});
            }
          } finally { await cdp.detach(); }
        };
        await Promise.all(currentContext.pages().map(session.prepareDevicePage));
        currentContext.on('page', currentPage => { void session.prepareDevicePage(currentPage).catch(() => {}); });
        currentContext.on('close', () => { setTimeout(() => {
          if (!closing && session._cdpBrowser.isConnected()) void session.close();
        }, 0); });
        configuredContexts.add(currentContext);
        attachStylesheetDiagnostics(currentContext, slot);
      },
      /**
       * Đóng process thật trước khi nhả IP/proxy; mọi caller chờ cùng một lần dọn.
       * @return {Promise<void>} Engine đã thoát và callback dọn phiên đã kết thúc.
       * @throws {Error} Khi không xác nhận được process đã dừng; giữ nguyên tài nguyên của phiên.
       * @author ductv <ductv@getflycrm.com>
       * @since 2026-11-17
       */
      close() {
        if (!closing) {
          session.isClosed = true;
          closing = Promise.resolve().then(async () => {
            await stopObscuraSession(engine.process);
            session.disposeCompleteTextWatcher?.(); session.disposeMaxRunTimer?.();
            clearInterval(session._monitorInterval); clearInterval(session._autofillTimer);
            for (const timer of session._autofillTimers || []) clearInterval(timer);
            session._autofillTimers?.clear();
            await session._cdpBrowser.close().catch(() => {});
            activeBrowsers.delete(session);
            pendingObscuraSessions.delete(session);
            await session.onClosed?.();
          }).catch(error => { session.isClosed = false; closing = null; activeBrowsers.add(session); throw error; });
        }
        return closing;
      },
    });
    startupRecord = session;
    session._stopProfile = session.close;
    pendingObscuraSessions.delete(startingSession);
    pendingObscuraSessions.add(session);
    session.supportsNativeWindow = false;
    /**
     * Phản ánh khả năng headless cho caller nội bộ; UI dùng Screen View.
     * @return {Promise<boolean>} False vì engine không có cửa sổ Desktop.
     * @author ductv <ductv@getflycrm.com>
     * @since 2026-11-17
     */
    session.showWindow = async () => false;
    /**
     * Giữ trạng thái headless khi caller yêu cầu ẩn.
     * @return {Promise<boolean>} True vì engine luôn chạy trong app.
     * @author ductv <ductv@getflycrm.com>
     * @since 2026-11-17
     */
    session.hideWindow = async () => { session.isWindowVisible = false; return true; };
    /**
     * Nối lại điều khiển ba lần khi process còn sống; giữ khóa/lead nếu chưa khôi phục được.
     * @return {Promise<void>} Kết thúc khôi phục hoặc đánh dấu mất kết nối, không giết phiên đang sống.
     * @author ductv <ductv@getflycrm.com>
     * @since 2026-11-17
     */
    const recoverConnection = () => {
      if (closing) return closing;
      if (reconnecting) return reconnecting;
      reconnecting = Promise.resolve().then(async () => {
        for (const delay of [200, 1000, 3000]) {
          if (closing || !session.isObscuraProcessAlive()) return;
          session.connectionStatus = 'disconnected';
          session.addBrowserLog?.({ type: 'obscura_cdp_disconnected', detail: 'Mất CDP; giữ process, IP và record để nối lại.' });
          await new Promise(resolve => setTimeout(resolve, delay));
          let replacement;
          try {
            replacement = await chromium.connectOverCDP(engine.cdpEndpoint, { timeout: 5000 });
            if (closing) { await replacement.close(); return; }
            session._cdpBrowser = replacement;
            session.browser = session.context = replacement.contexts()[0];
            session.mainPage = session.page = session.browser.pages()[0] || await session.browser.newPage();
            await session.configureContext(session.browser);
            await session.resumeRuntime?.();
            replacement.on('disconnected', recoverConnection);
            session.connectionStatus = 'connected';
            session.addBrowserLog?.({ type: 'obscura_connection_restored', detail: 'Đã khôi phục CDP trên cùng phiên Obscura.' });
            return;
          } catch { await replacement?.close().catch(() => {}); }
        }
        session.connectionStatus = 'reconnect_failed';
        session.addBrowserLog?.({ type: 'obscura_reconnect_failed', detail: 'Chưa nối lại được CDP; giữ phiên và khóa IP.' });
      }).finally(() => { reconnecting = null; });
      return reconnecting;
    };
    browser.on('disconnected', recoverConnection);
    engine.process.once('exit', () => { if (!closing) void session.close(); });
    await session.configureContext(context);
    if (targetUrl) await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (registerSession) { activeBrowsers.add(session); pendingObscuraSessions.delete(session); }
    return session;
  } catch (error) {
    try { await stopObscuraSession(engine?.process || startingChild); }
    catch {
      error.obscuraStopUnconfirmed = true;
      activeBrowsers.add(startupRecord || startingSession);
      throw error;
    }
    pendingObscuraSessions.delete(startingSession);
    if (startupRecord) pendingObscuraSessions.delete(startupRecord);
    await browser?.close().catch(() => {});
    throw error;
  }
}
