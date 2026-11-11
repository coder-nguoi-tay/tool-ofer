import { isFullHtmlDebugEnabled } from './is-full-html-debug-enabled.mjs';
import { OFFER_HTML_FULL_LOG } from './state/offer-html-full-log.mjs';
import { appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { moduleState } from './state/module-state.mjs';

/**
 * Ghi HTML của tab vào hàng đợi log, bỏ qua bản poll không thay đổi.
 * @param {object} page Tab cần chụp.
 * @param {string} reason Nguồn kích hoạt.
 * @return {void} Đăng ký ghi log.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
function logFullPageHtml(page, reason = 'event') {
  try {
    if (!isFullHtmlDebugEnabled() || moduleState.fullHtmlBytes >= 10 * 1024 * 1024 || !page || typeof page.isClosed === 'function' && page.isClosed()) return;
    page.content().then(html => {
      // Lượt poll định kỳ chỉ ghi khi HTML đổi so với lần ghi trước của tab đó.
      const hash = createHash('sha1').update(html).digest('hex');
      if (reason === 'poll' && page._uxLastHtmlHash === hash) return;
      page._uxLastHtmlHash = hash;
      const entry = {
        ts: new Date().toISOString(),
        reason,
        url: typeof page.url === 'function' ? page.url() : '',
        title: '',
        html
      };
      const line = JSON.stringify(entry) + '\n';
      moduleState.fullHtmlWriteChain = moduleState.fullHtmlWriteChain.then(async () => {
        const bytes = Buffer.byteLength(line);
        if (!isFullHtmlDebugEnabled() || (moduleState.fullHtmlBytes || 0) + bytes > 10 * 1024 * 1024) return;
        await appendFile(OFFER_HTML_FULL_LOG, line);
        moduleState.fullHtmlBytes = (moduleState.fullHtmlBytes || 0) + bytes;
      }).catch(() => {});
    }).catch(() => {});
  } catch {}
}
export { logFullPageHtml };
