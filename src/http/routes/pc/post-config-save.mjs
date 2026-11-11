import { dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { getAutoLeadPCDir } from '../../../config/paths.mjs';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { safeConfigFileName } from '../../../config/actions/safe-config-file-name.mjs';
import { writeFileSync } from 'node:fs';

/**
 * Xử lý API pc-config-save.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostPcConfigSave(request, response) {
  if (request.method === 'POST' && request.url === '/pc/config/save') {
    try {
      const body = JSON.parse(await readRequestBody(request));
      const baseDir = getAutoLeadPCDir();
      const filePath = join(baseDir, 'Config', 'Proxy', safeConfigFileName(body.file));
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, {
          recursive: true
        });
      }
      writeFileSync(filePath, body.content || '', 'utf8');
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
