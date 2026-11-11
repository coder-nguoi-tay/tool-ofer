import { activeBrowsers } from '../../../browser/sessions.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { prepareManualBrowserClose } from '../../../browser/actions/prepare-manual-browser-close.mjs';
import { queueAutomaticRefill } from '../../../refill/actions/queue-automatic-refill.mjs';

/**
 * Đóng slot từ giao diện, cho bù lại nếu đây là luồng không check lead đang tự bù.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function handlePostBrowserClose(request, response) {
  if (request.method === 'POST' && request.url.startsWith('/browser/close/')) {
    const slot = parseInt(request.url.split('/').pop(), 10);
    const session = [...activeBrowsers].find(s => !s.isClosed && (s.slot ?? s.tileIndex + 1) === slot);
    if (!session) {
      respondWithJson(response, 404, {
        error: `Không tìm thấy luồng Slot ${slot}`
      });
      return true;
    }
    const refill = prepareManualBrowserClose(session);
    await session.browser?.close?.().catch(() => {});
    if (refill) queueAutomaticRefill();
    respondWithJson(response, 200, {
      ok: true,
      slot
    });
    return true;
  }
  return false;
}
