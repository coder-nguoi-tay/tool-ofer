import { OFFER_HTML_FULL_DIR } from './html-capture/state/offer-html-full-dir.mjs';
import { mkdirSync } from 'node:fs';
export { logFullPageHtml } from './html-capture/log-full-page-html.mjs';
export { attachFullHtmlLoggerToPage } from './html-capture/attach-full-html-logger-to-page.mjs';
export { attachFullHtmlLoggerToBrowser } from './html-capture/attach-full-html-logger-to-browser.mjs';
export { attachFullHtmlLoggerToContext } from './html-capture/attach-full-html-logger-to-context.mjs';
export { purgeFullHtmlCaptures } from './html-capture/purge-full-html-captures.mjs';
mkdirSync(OFFER_HTML_FULL_DIR, {
  recursive: true
});
