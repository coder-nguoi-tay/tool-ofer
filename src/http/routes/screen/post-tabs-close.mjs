import { activeBrowsers } from '../../../browser/sessions.mjs';
import { attachScreencastSession } from '../../../browser/screencast.mjs';
import { autoRefill } from '../../../runtime/constants/auto-refill.mjs';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { releaseScreencast } from '../../../browser/screencast.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { saveAutoRefillSettings } from '../../../refill/actions/save-auto-refill-settings.mjs';
import { screencastSessions } from '../../../runtime/constants/screencast-sessions.mjs';

/**
 * Xử lý API screen-tabs-close.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostScreenTabsClose(request, response) {
  if (request.method === 'POST' && request.url.startsWith('/screen/tabs/close/')) {
    const slot = parseInt(request.url.split('/').pop(), 10);
    const session = [...activeBrowsers].find(s => !s.isClosed && (s.slot ?? s.tileIndex + 1) === slot);
    if (!session) {
      respondWithJson(response, 404, {
        error: 'not found'
      });
      return true;
    }
    try {
      const body = JSON.parse(await readRequestBody(request));
      const pages = session.browser.pages().filter(p => !p.isClosed());
      const targetIndex = body.index ?? 0;
      const targetPage = pages[targetIndex];
      if (!targetPage) {
        respondWithJson(response, 400, {
          error: 'invalid tab'
        });
        return true;
      }

      // Gỡ listener tự khôi phục trước khi đóng tab: tránh tranh nhau gắn lại với đoạn chuyển tab bên dưới.
      screencastSessions.get(slot)?.unbindListeners?.();
      await targetPage.close().catch(() => {});
      let remainingPages = session.browser.pages().filter(p => !p.isClosed());
      if (remainingPages.length === 0) {
        session.suppressAutoRefill = true;
        session.addBrowserLog?.({
          type: 'manual_browser_closed',
          detail: 'Đã đóng tab cuối cùng qua Screen View; tắt trình duyệt.'
        });
        if (autoRefill.enabled && !autoRefill.stopRequested && autoRefill.targetCount > 0) {
          autoRefill.targetCount -= 1;
          void saveAutoRefillSettings();
        }
        await session.browser?.close?.().catch(() => {});
        respondWithJson(response, 200, {
          ok: true,
          closedSession: true,
          remaining: 0
        });
        return true;
      }
      const newActiveIndex = Math.max(0, Math.min(targetIndex > 0 ? targetIndex - 1 : 0, remainingPages.length - 1));
      const nextActivePage = remainingPages[newActiveIndex];
      await nextActivePage.bringToFront().catch(() => {});
      const sc = screencastSessions.get(slot);
      if (sc) {
        await releaseScreencast(sc);
        const newCdp = await session.browser.newCDPSession(nextActivePage);
        await attachScreencastSession(sc, newCdp, nextActivePage);
      }
      respondWithJson(response, 200, {
        ok: true,
        activeIndex: newActiveIndex,
        remaining: remainingPages.length
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
