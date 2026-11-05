import { existsSync } from 'node:fs';
import {
  binaryInfo,
  ensureBinary,
  launchPersistentContext as cloakLaunchPersistentContext,
} from 'cloakbrowser';

/**
 * Kiểm tra xem binary CloakBrowser đã được tải và sẵn sàng sử dụng hay chưa.
 *
 * @return {boolean} True nếu binary đã có trên máy.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-21
 */
export function isCloakBrowserInstalled() {
  try {
    const info = binaryInfo();
    return Boolean(info?.installed && info?.binaryPath && existsSync(info.binaryPath));
  } catch {
    return false;
  }
}

/**
 * Lấy chi tiết trạng thái của CloakBrowser (phiên bản, đường dẫn binary, nền tảng).
 *
 * @return {{version: string|null, platform: string|null, binaryPath: string|null, installed: boolean, tier: string|null, error?: string}}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-21
 */
export function getCloakBrowserStatus() {
  try {
    const info = binaryInfo();
    return {
      version: info?.version ?? null,
      bundledVersion: info?.bundledVersion ?? null,
      platform: info?.platform ?? process.platform,
      binaryPath: info?.binaryPath ?? null,
      installed: Boolean(info?.installed && info?.binaryPath && existsSync(info.binaryPath)),
      tier: info?.tier ?? 'free',
    };
  } catch (err) {
    return {
      version: null,
      bundledVersion: null,
      platform: process.platform,
      binaryPath: null,
      installed: false,
      tier: 'free',
      error: err.message,
    };
  }
}

/**
 * Gắn tầng mô phỏng hành vi người thật (CloakBrowser Humanize) vào một Playwright BrowserContext.
 * Tự động biến đổi click, type, fill, scroll thành quỹ đạo Bezier mượt mà với độ trễ phím ngẫu nhiên.
 *
 * @param {object} context Đối tượng Playwright BrowserContext
 * @param {string} [preset='default'] Bộ cấu hình humanize ('default' hoặc 'careful')
 * @return {Promise<boolean>} True nếu gắn thành công
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-21
 */
export async function applyCloakHumanize(context, preset = 'default') {
  if (!context) return false;
  try {
    // CloakBrowser chỉ export subpath "." , "./puppeteer" và "./human".
    // resolveConfig nằm trong barrel "./human" — import "./human/config.js" sẽ ném
    // ERR_PACKAGE_PATH_NOT_EXPORTED vì package không khai báo subpath đó.
    const { patchContext, resolveConfig } = await import('cloakbrowser/human');
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

/**
 * Khởi chạy Browser Persistent Context sử dụng nhân Chromium vá C++ từ CloakBrowser.
 * Giúp qua mặt triệt để các hệ thống kiểm duyệt bot như Cloudflare Turnstile, Kasada, Akamai, FingerprintJS.
 *
 * @param {object} options Các tham số khởi chạy tương thích Playwright và CloakBrowser
 * @return {Promise<object>} Playwright BrowserContext
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-21
 */
export async function launchCloakBrowserPersistentContext(options = {}) {
  await ensureBinary().catch((err) => {
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
    stealthArgs: options.stealthArgs ?? true,
  });
}
