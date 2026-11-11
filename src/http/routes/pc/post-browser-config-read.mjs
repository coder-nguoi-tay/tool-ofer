import { existsSync } from 'node:fs';
import { getAutoLeadPCDir } from '../../../config/paths.mjs';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { safeConfigFileName } from '../../../config/actions/safe-config-file-name.mjs';

/**
 * Xử lý API pc-browser-config-read.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostPcBrowserConfigRead(request, response) {
  if (request.method === 'POST' && request.url === '/pc/browser-config/read') {
    try {
      const body = JSON.parse(await readRequestBody(request));
      const baseDir = getAutoLeadPCDir();
      const filePath = join(baseDir, 'Config', 'Browser', safeConfigFileName(body.file));
      let text = '';
      if (existsSync(filePath)) {
        text = readFileSync(filePath, 'utf8');
      } else {
        const fallback = join(baseDir, 'Config', safeConfigFileName(body.file));
        if (existsSync(fallback)) {
          text = readFileSync(fallback, 'utf8');
        }
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
