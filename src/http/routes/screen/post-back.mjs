import { activeBrowsers } from '../../../browser/sessions.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { screencastSessions } from '../../../runtime/constants/screencast-sessions.mjs';

/**
 * Xử lý API screen-back.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostScreenBack(request, response) {
  if (request.method === 'POST' && request.url.startsWith('/screen/back/')) {
    const slot = parseInt(request.url.split('/').pop(), 10);
    const sc = screencastSessions.get(slot);
    if (!sc?.page || sc.page.isClosed()) {
      respondWithJson(response, 404, {
        error: 'not found'
      });
      return true;
    }
    const res = await sc.page.goBack({
      waitUntil: 'domcontentloaded',
      timeout: 15000
    }).catch(err => ({
      error: err.message
    }));
    // goBack trả null khi tab không còn trang trước để quay lại.
    if (res === null) {
      respondWithJson(response, 200, {
        ok: false,
        reason: 'no_history'
      });
      return true;
    }
    if (res?.error) {
      respondWithJson(response, 500, {
        error: res.error
      });
      return true;
    }
    const backSession = [...activeBrowsers].find(s => (s.slot ?? s.tileIndex + 1) === slot);
    backSession?.addBrowserLog?.({
      type: 'navigate',
      detail: `Quay lại trang trước qua Screen View: ${sc.page.url()}`
    });
    respondWithJson(response, 200, {
      ok: true,
      url: sc.page.url()
    });
    return true;
  }
  return false;
}
