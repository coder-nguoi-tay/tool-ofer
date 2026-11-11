import { dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { writeFileSync } from 'node:fs';

/**
 * Xử lý API script-save.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostScriptSave(request, response) {
  if (request.method === 'POST' && request.url === '/script/save') {
    try {
      const body = JSON.parse(await readRequestBody(request));
      const dir = dirname(body.path);
      if (!existsSync(dir)) {
        mkdirSync(dir, {
          recursive: true
        });
      }
      writeFileSync(body.path, body.content || '', 'utf8');
      respondWithJson(response, 200, {
        success: true
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
