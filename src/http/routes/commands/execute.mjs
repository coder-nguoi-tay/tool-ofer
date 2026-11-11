import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API condition-76.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @param {object} context Các command đã đăng ký với máy chủ.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleCommandsExecute(request, response, {
  handlers
}) {
  const handler = request.method === 'POST' ? handlers[request.url] : undefined;
  if (handler) {
    try {
      const body = await readRequestBody(request);
      respondWithJson(response, 200, await handler(body));
    } catch (error) {
      respondWithJson(response, 400, {
        error: error.message
      });
    }
    return true;
  }
  return false;
}
