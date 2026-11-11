import { attachFullHtmlLoggerToPage } from './attach-full-html-logger-to-page.mjs';

/**
 * Gắn log HTML cho các tab trong browser context.
 * @param {object} context Context cần theo dõi.
 * @return {void} Đăng ký ghi log.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function attachFullHtmlLoggerToContext(context) {
  try {
    context.on('page', attachFullHtmlLoggerToPage);
    try {
      for (const p of context.pages()) {
        attachFullHtmlLoggerToPage(p);
      }
    } catch {}
  } catch {}
}
export { attachFullHtmlLoggerToContext };
