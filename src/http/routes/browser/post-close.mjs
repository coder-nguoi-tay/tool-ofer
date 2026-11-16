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
 * @since 2026-11-16
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
    if (session.isGoLogin && session.closeGoLoginSession) {
      await session.closeGoLoginSession();
      if (!session._gologinProfileStopped || session._gologinProfileDeleted !== true) {
        respondWithJson(response, 500, { error: session._gologinProfileStopped ? 'Orbita đã dừng nhưng chưa xóa được profile trên GoLogin. Kiểm tra nhật ký GoLogin.' : 'Chưa dừng được Orbita; giữ profile và khóa IP/proxy để tránh xóa phiên còn chạy.' });
        return true;
      }
    } else {
      await session.browser?.close?.().catch(() => {});
      if (refill) queueAutomaticRefill();
    }
    respondWithJson(response, 200, {
      ok: true,
      slot
    });
    return true;
  }
  return false;
}
