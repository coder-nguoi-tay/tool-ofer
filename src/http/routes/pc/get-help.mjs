import { existsSync } from 'node:fs';
import { getAutoLeadPCDir } from '../../../config/paths.mjs';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API pc-help.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetPcHelp(request, response) {
  if (request.method === 'GET' && request.url === '/pc/help') {
    try {
      const baseDir = getAutoLeadPCDir();
      const helpPath = join(baseDir, 'Help', 'Help.rtf');
      if (!existsSync(helpPath)) {
        respondWithJson(response, 200, {
          helpText: 'Không tìm thấy file Help.rtf'
        });
        return true;
      }
      const buf = readFileSync(helpPath);
      const rtfStr = buf.toString('latin1');
      const plain = rtfStr.replace(/\\par[d]?/g, '\n').replace(/\\tab/g, '\t').replace(/\\[a-z0-9\-]+/gi, ' ').replace(/[{}]/g, '').replace(/[ \t]+/g, ' ').trim();
      respondWithJson(response, 200, {
        helpText: plain
      });
    } catch {
      respondWithJson(response, 200, {
        helpText: 'Không tìm thấy file Help.rtf'
      });
    }
    return true;
  }
  return false;
}
