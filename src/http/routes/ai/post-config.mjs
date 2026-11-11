import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { saveAiConfigFile } from '../../../config/ai.mjs';

/**
 * Xử lý API ai-config.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostAiConfig(request, response) {
  if (request.method === 'POST' && request.url === '/ai/config') {
    try {
      const body = JSON.parse(await readRequestBody(request));
      const res = saveAiConfigFile(body);
      respondWithJson(response, 200, res);
    } catch (err) {
      respondWithJson(response, 400, {
        error: err.message
      });
    }
    return true;
  }
  return false;
}
