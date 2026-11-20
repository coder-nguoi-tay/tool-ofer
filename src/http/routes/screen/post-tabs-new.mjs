import { activeBrowsers } from '../../../browser/sessions.mjs';
import { switchScreencastPage } from '../../../browser/screencast/switch-screencast-page.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { screencastSessions } from '../../../runtime/constants/screencast-sessions.mjs';

/**
 * Xử lý API screen-tabs-new.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export async function handlePostScreenTabsNew(request, response) {
  if (request.method === 'POST' && request.url.startsWith('/screen/tabs/new/')) {
    const slot = parseInt(request.url.split('/').pop(), 10);
    const session = [...activeBrowsers].find(s => !s.isClosed && (s.slot ?? s.tileIndex + 1) === slot);
    if (!session) {
      respondWithJson(response, 404, {
        error: 'not found'
      });
      return true;
    }
    try {
      const sc = screencastSessions.get(slot);
      const selection = Symbol();
      if (sc) sc.viewSelection = selection;
      const newPage = await session.browser.newPage();
      await newPage.goto('about:blank').catch(() => {});
      const pages = session.browser.pages().filter(p => !p.isClosed());
      const newIndex = pages.indexOf(newPage);
      if (!session.isObscura && session.engine !== 'obscura') await newPage.bringToFront().catch(() => {});
      if (sc) await switchScreencastPage(sc, selection, session, newPage, slot);
      respondWithJson(response, 200, {
        ok: true,
        index: newIndex
      });
    } catch (err) {
      respondWithJson(response, 500, {
        error: err.message
      });
    }
    return true;
  }
  return false;
}
