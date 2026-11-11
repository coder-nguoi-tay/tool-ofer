import { activeBrowsers } from '../../../browser/sessions.mjs';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { screencastSessions } from '../../../runtime/constants/screencast-sessions.mjs';

/**
 * Xử lý API screen-navigate.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostScreenNavigate(request, response) {
  if (request.method === 'POST' && request.url.startsWith('/screen/navigate/')) {
    const slot = parseInt(request.url.split('/').pop(), 10);
    const sc = screencastSessions.get(slot);
    if (!sc?.page || sc.page.isClosed()) {
      respondWithJson(response, 404, {
        error: 'not found'
      });
      return true;
    }
    try {
      const body = JSON.parse(await readRequestBody(request));
      let targetUrl = String(body.url || '').trim();
      if (targetUrl && !/^https?:\/\//i.test(targetUrl)) {
        targetUrl = `https://${targetUrl}`;
      }
      if (targetUrl) {
        await sc.page.goto(targetUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 20000
        }).catch(() => {});
        const navSession = [...activeBrowsers].find(s => (s.slot ?? s.tileIndex + 1) === slot);
        navSession?.addBrowserLog?.({
          type: 'navigate',
          detail: `Điều hướng qua Screen View tới: ${targetUrl}`
        });
      }
      respondWithJson(response, 200, {
        ok: true,
        url: sc.page.url()
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
