import { activeBrowsers } from '../../browser/sessions.mjs';
import { attachFullHtmlLoggerToBrowser } from '../../logging/html-capture.mjs';
import { bookmarks } from '../../runtime/constants/bookmarks.mjs';
import { chromium } from 'playwright';
import { navigationTimeout } from '../../runtime/constants/navigation-timeout.mjs';
import { toPlaywrightProxy } from '../configuration.mjs';

/**
 * Mở một cửa sổ Chromium độc lập qua proxy và điều hướng tới website đích.
 *
 * @param {object} options Tham số mở cửa sổ.
 * @return {Promise<string>} Trạng thái mở cửa sổ.
 * @throws {Error} Khi Chromium không khởi chạy được.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function openBrowserThroughProxy({
  proxy,
  websiteUrl,
  browserNumber,
  tile,
  userAgents,
  language,
  withBookmarks
}) {
  const browser = await chromium.launch({
    headless: false,
    proxy: toPlaywrightProxy(proxy),
    args: tile ? [`--window-position=${tile.left},${tile.top}`, `--window-size=${tile.width},${tile.height}`] : []
  });
  activeBrowsers.add(browser);
  attachFullHtmlLoggerToBrowser(browser);
  browser.on('disconnected', () => activeBrowsers.delete(browser));

  // viewport: null để cửa sổ thật quyết định khung nhìn, nếu không Playwright ép 1280x720.
  const context = await browser.newContext({
    viewport: null,
    locale: language,
    ...(userAgents.length > 0 && {
      userAgent: userAgents[Math.floor(Math.random() * userAgents.length)]
    })
  });
  const page = await context.newPage();
  let result;
  try {
    await page.goto(websiteUrl, {
      waitUntil: 'domcontentloaded',
      timeout: navigationTimeout
    });
    result = `Cửa sổ ${browserNumber}: đã mở website qua ${proxy.server}.`;
  } catch (error) {
    result = `Cửa sổ ${browserNumber}: đã mở nhưng website không tải được (${error.message.split('\n')[0]}).`;
  }
  if (withBookmarks) {
    for (const url of bookmarks) {
      const tab = await context.newPage();
      await tab.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: navigationTimeout
      }).catch(() => {});
    }
  }
  return result;
}
