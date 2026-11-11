import { OFFER_HTML_FULL_LOG } from './state/offer-html-full-log.mjs';
import { attachFullHtmlLoggerToPage } from './attach-full-html-logger-to-page.mjs';

/**
 * Gắn log HTML cho các tab hiện có và tab mới của trình duyệt.
 * @param {object} browser Trình duyệt cần theo dõi.
 * @return {void} Đăng ký ghi log.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function attachFullHtmlLoggerToBrowser(browser) {
  try {
    browser.on('page', attachFullHtmlLoggerToPage);
    try {
      for (const p of browser.pages()) {
        attachFullHtmlLoggerToPage(p);
      }
    } catch {}
    console.log(`[HTML-FULL] Logger attached to browser. Saving to ${OFFER_HTML_FULL_LOG}`);
  } catch {}
}
export { attachFullHtmlLoggerToBrowser };
