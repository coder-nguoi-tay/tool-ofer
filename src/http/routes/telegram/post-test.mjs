import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { sendTelegramTestMessage } from '../../../config/telegram.mjs';

/**
 * Xử lý API telegram-test.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostTelegramTest(request, response) {
  if (request.method === 'POST' && request.url === '/telegram/test') {
    const result = await sendTelegramTestMessage();
    respondWithJson(response, result.ok ? 200 : 400, result);
    return true;
  }
  return false;
}
