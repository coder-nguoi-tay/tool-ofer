import { activeBrowsers } from '../../../browser/sessions.mjs';
import { switchScreencastPage } from '../../../browser/screencast/switch-screencast-page.mjs';
import { prepareManualBrowserClose } from '../../../browser/actions/prepare-manual-browser-close.mjs';
import { queueAutomaticRefill } from '../../../refill/actions/queue-automatic-refill.mjs';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { screencastSessions } from '../../../runtime/constants/screencast-sessions.mjs';

/**
 * Đóng tab theo nguồn hình của phím tắt hoặc vị trí của nút đóng. Đóng tab cuối áp dụng chính sách đóng slot.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
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
      const sc = screencastSessions.get(slot);
      const closeViewedPage = Object.hasOwn(body, 'screenSourceId');
      const targetIndex = closeViewedPage ? pages.indexOf(sc?.page) : body.index ?? 0;
      if (closeViewedPage && (!body.screenSourceId || sc?.screenSourceId !== body.screenSourceId || sc.cleaned || targetIndex < 0)) {
        respondWithJson(response, 409, { error: 'Nguồn hình đã thay đổi. Hãy kiểm tra tab đang xem.' });
        return true;
      }
      const targetPage = pages[targetIndex];
      if (!targetPage) {
        respondWithJson(response, 400, {
          error: 'invalid tab'
        });
        return true;
      }

      // Gỡ listener tự khôi phục trước khi đóng tab: tránh tranh nhau gắn lại với đoạn chuyển tab bên dưới.
      const selection = Symbol();
      if (sc) sc.viewSelection = selection;
      sc?.unbindListeners?.();
      targetPage._uxClosedByApp = 'screen_view_manual';
      await targetPage.close();
      const remainingPages = session.browser.pages().filter(p => !p.isClosed());
      if (remainingPages.length === 0) {
        const refill = prepareManualBrowserClose(session);
        if (session.isGoLogin && session.closeGoLoginSession) {
          await session.closeGoLoginSession();
          if (!session._gologinProfileStopped || session._gologinProfileDeleted !== true) throw new Error('Chưa hoàn tất dừng/xóa profile GoLogin; kiểm tra nhật ký GoLogin.');
        } else if (session.isObscura || session.engine === 'obscura') {
          await session.close();
          activeBrowsers.delete(session);
        } else await session.browser?.close?.().catch(() => {});
        if (refill && !(session.isObscura && session.onClosed)) queueAutomaticRefill();
        respondWithJson(response, 200, {
          ok: true,
          closedSession: true,
          remaining: 0
        });
        return true;
      }
      if (screencastSessions.get(slot) !== sc || (sc && (sc.cleaned || sc.viewSelection !== selection))) {
        respondWithJson(response, 200, { ok: true, remaining: remainingPages.length });
        return true;
      }
      const newActiveIndex = Math.max(0, Math.min(targetIndex > 0 ? targetIndex - 1 : 0, remainingPages.length - 1));
      const nextActivePage = remainingPages[newActiveIndex];
      if (!session.isObscura && session.engine !== 'obscura') await nextActivePage.bringToFront().catch(() => {});
      if (sc) await switchScreencastPage(sc, selection, session, nextActivePage, slot);
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
