import { launchPersistentContext as cloakLaunchPersistentContext } from 'cloakbrowser';
import { ensureBinary } from 'cloakbrowser';

/**
 * Khởi chạy Browser Persistent Context sử dụng nhân Chromium vá C++ từ CloakBrowser.
 * Giúp qua mặt triệt để các hệ thống kiểm duyệt bot như Cloudflare Turnstile, Kasada, Akamai, FingerprintJS.
 *
 * @param {object} options Các tham số khởi chạy tương thích Playwright và CloakBrowser
 * @return {Promise<object>} Playwright BrowserContext
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function launchCloakBrowserPersistentContext(options = {}) {
  await ensureBinary().catch(err => {
    console.warn(`[CloakBrowser] ensureBinary: ${err.message}`);
  });
  return cloakLaunchPersistentContext({
    userDataDir: options.userDataDir,
    headless: options.headless ?? true,
    viewport: options.viewport ?? null,
    userAgent: options.userAgent,
    locale: options.locale,
    timezone: options.timezone || options.timezoneId,
    timezoneId: options.timezoneId || options.timezone,
    proxy: options.proxy,
    // CloakBrowser tự gắn Humanize layer (patchContext) ngay trong lúc khởi chạy
    // khi humanize=true — không cần gọi applyCloakHumanize lần nữa ở ngoài.
    humanize: options.humanize !== false,
    humanPreset: options.humanPreset ?? 'default',
    args: options.args ?? [],
    contextOptions: options.contextOptions ?? {},
    launchOptions: options.launchOptions ?? {},
    stealthArgs: options.stealthArgs ?? true
  });
}
export { launchCloakBrowserPersistentContext };
