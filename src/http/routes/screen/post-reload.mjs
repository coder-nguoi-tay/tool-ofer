import { activeBrowsers } from '../../../browser/sessions.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { screencastSessions } from '../../../runtime/constants/screencast-sessions.mjs';

/**
 * Xử lý API screen-reload.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostScreenReload(request, response) {
  if (request.method === 'POST' && request.url.startsWith('/screen/reload/')) {
    const slot = parseInt(request.url.split('/').pop(), 10);
    const sc = screencastSessions.get(slot);
    if (!sc?.page || sc.page.isClosed()) {
      respondWithJson(response, 404, {
        error: 'not found'
      });
      return true;
    }
    await sc.page.reload({
      waitUntil: 'domcontentloaded',
      timeout: 20000
    }).catch(() => {});
    const reloadSession = [...activeBrowsers].find(s => (s.slot ?? s.tileIndex + 1) === slot);
    reloadSession?.addBrowserLog?.({
      type: 'navigate',
      detail: `Làm mới trang qua Screen View: ${sc.page.url()}`
    });
    respondWithJson(response, 200, {
      ok: true,
      url: sc.page.url()
    });
    return true;
  }
  return false;
}
