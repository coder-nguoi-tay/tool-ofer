import { activeBrowsers } from '../../../browser/sessions.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API browser-show-all.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostBrowserShowAll(request, response) {
  if (request.method === 'POST' && request.url === '/browser/show-all') {
    const liveSessions = [...activeBrowsers].filter(s => !s.isClosed);
    await Promise.allSettled(liveSessions.map(s => s.showWindow?.(true)));
    respondWithJson(response, 200, {
      ok: true,
      count: liveSessions.length
    });
    return true;
  }
  return false;
}
