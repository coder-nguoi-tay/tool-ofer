import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API script-read.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostScriptRead(request, response) {
  if (request.method === 'POST' && request.url === '/script/read') {
    try {
      const body = JSON.parse(await readRequestBody(request));
      let text = '';
      if (existsSync(body.path)) {
        text = readFileSync(body.path, 'utf8');
      }
      respondWithJson(response, 200, {
        content: text
      });
    } catch (err) {
      respondWithJson(response, 400, {
        error: err.message
      });
    }
    return true;
  }
  return false;
}
