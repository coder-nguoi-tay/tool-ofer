import { isFullHtmlDebugEnabled } from './is-full-html-debug-enabled.mjs';
import { logFullPageHtml } from './log-full-page-html.mjs';

/**
 * Theo dõi tải trang và thay đổi HTML của một tab.
 * @param {object} page Tab cần theo dõi.
 * @return {void} Đăng ký ghi log.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
function attachFullHtmlLoggerToPage(page) {
  try {
    if (!isFullHtmlDebugEnabled() || !page || page._fullHtmlLogged) return;
    page._fullHtmlLogged = true;
    page.on('load', () => logFullPageHtml(page, 'load'));
    page.on('domcontentloaded', () => logFullPageHtml(page, 'domcontentloaded'));
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) logFullPageHtml(page, 'navigated');
    });
    // Poll thưa (10s) và chỉ ghi khi HTML đổi: page.content() trên mọi tab mỗi 2,5s làm Chrome nặng.
    const iv = setInterval(() => {
      if (page.isClosed() || !isFullHtmlDebugEnabled()) {
        clearInterval(iv);
        return;
      }
      logFullPageHtml(page, 'poll');
    }, 10000);
    iv.unref?.();
    page.on('close', () => clearInterval(iv));
    logFullPageHtml(page, 'attached');
  } catch {}
}
export { attachFullHtmlLoggerToPage };
