import { activeBrowsers } from '../../../browser/sessions.mjs';
import { autofillQueue } from '../../../runtime/constants/autofill-queue.mjs';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { runAiAssist } from '../../../../ai-assist.mjs';

/**
 * Xử lý API ai-trigger.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function handlePostAiTrigger(request, response) {
  if (request.method === 'POST' && request.url === '/ai/trigger') {
    try {
      const body = JSON.parse((await readRequestBody(request)) || '{}');
      const targetSlot = Number(body.slot) || 1;
      const foundSession = [...activeBrowsers].find(s => s.tileIndex + 1 === targetSlot);
      if (!foundSession) {
        respondWithJson(response, 404, {
          error: `Không tìm thấy trình duyệt ở Slot ${targetSlot}.`
        });
        return true;
      }
      const page = foundSession.mainPage || foundSession.browserContext?.pages().find(p => !p.isClosed());
      if (!page) {
        respondWithJson(response, 400, {
          error: `Slot ${targetSlot} không có tab nào đang mở.`
        });
        return true;
      }
      const record = foundSession.currentRecord || (autofillQueue.available[0] ?? {});
      void runAiAssist(page, record, foundSession, {
        forceRetry: true,
        onLog: entry => foundSession.addLog?.(entry)
      });
      respondWithJson(response, 200, {
        success: true,
        message: `Đã yêu cầu AI kiểm tra giao diện cho Slot ${targetSlot} trên trang ${page.url()}.`
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
