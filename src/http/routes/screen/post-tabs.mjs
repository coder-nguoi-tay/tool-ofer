import { activeBrowsers } from '../../../browser/sessions.mjs';
import { attachScreencastSession } from '../../../browser/screencast.mjs';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { releaseScreencast } from '../../../browser/screencast.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { screencastSessions } from '../../../runtime/constants/screencast-sessions.mjs';

/**
 * Chuyển nguồn Screen View sang tab đã chọn, giữ trình duyệt headless hoạt động nền.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export async function handlePostScreenTabs(request, response) {
  if (request.method === 'POST' && request.url.startsWith('/screen/tabs/')) {
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
      const targetPage = pages[body.index ?? 0];
      if (!targetPage) {
        respondWithJson(response, 400, {
          error: 'invalid tab'
        });
        return true;
      }
      if (body.manualCaptchaRequestId && (targetPage._manualCaptchaPending !== true || targetPage._manualCaptchaRequestId !== body.manualCaptchaRequestId)) {
        respondWithJson(response, 409, { error: 'Tab hoặc lượt xác minh CAPTCHA đã thay đổi.' });
        return true;
      }
      // Obscura headless chọn tab bằng nguồn CDP của stream, không có cửa sổ native để đưa lên trước.
      if (!session.isObscura && session.engine !== 'obscura') await targetPage.bringToFront();
      const sc = screencastSessions.get(slot);
      if (sc) {
        const newCdp = await session.browser.newCDPSession(targetPage);
        await releaseScreencast(sc);
        await attachScreencastSession(sc, newCdp, targetPage, slot, session);
      }
      respondWithJson(response, 200, {
        ok: true
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
