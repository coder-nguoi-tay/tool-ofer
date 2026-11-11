import { activeBrowsers } from '../../../browser/sessions.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API browser-hide.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostBrowserHide(request, response) {
  if (request.method === 'POST' && request.url.startsWith('/browser/hide/')) {
    const slot = parseInt(request.url.split('/').pop(), 10);
    const session = [...activeBrowsers].find(s => !s.isClosed && (s.slot ?? s.tileIndex + 1) === slot);
    if (!session) {
      respondWithJson(response, 404, {
        error: `Không tìm thấy luồng Slot ${slot}`
      });
      return true;
    }
    try {
      await session.hideWindow?.();
      respondWithJson(response, 200, {
        ok: true,
        slot,
        visible: false
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
