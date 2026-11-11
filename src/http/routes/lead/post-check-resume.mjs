import { activeBrowsers } from '../../../browser/sessions.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API lead-check-resume.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostLeadCheckResume(request, response) {
  if (request.method === 'POST' && request.url === '/lead-check/resume') {
    let bodyText = '';
    for await (const chunk of request) bodyText += chunk;
    const parsed = bodyText ? JSON.parse(bodyText) : {};
    const targetSlot = Number(parsed.slot);
    let foundSession = null;
    for (const s of activeBrowsers) {
      if (s.tileIndex + 1 === targetSlot) {
        foundSession = s;
        break;
      }
    }
    if (!foundSession) {
      respondWithJson(response, 404, {
        error: `Không tìm thấy trình duyệt ở slot ${targetSlot}`
      });
      return true;
    }
    foundSession.leadCheckStatus = 'confirmed';
    // Autofill chỉ chạy tiếp khi screen5LeadVerified = true (xem guard đầu vòng quét trong autofill.mjs).
    foundSession.screen5LeadVerified = true;
    foundSession.leadCheckMessage = 'Đã mở khóa thủ công. Tiếp tục tự điền form.';
    try {
      foundSession.triggerAutofillScan?.();
    } catch {}
    respondWithJson(response, 200, {
      message: `Slot ${targetSlot} đã được mở khóa để tiếp tục điền form.`
    });
    return true;
  }
  return false;
}
