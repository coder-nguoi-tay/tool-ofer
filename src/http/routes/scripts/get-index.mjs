import { getAutoLeadPCDir } from '../../../config/paths.mjs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readdir } from 'node:fs/promises';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API scripts.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetScriptsIndex(request, response) {
  if (request.method === 'GET' && request.url === '/scripts') {
    const baseDir = getAutoLeadPCDir();
    const candidates = [join(baseDir, 'Script', 'Offers'), join(baseDir, 'Script', 'RRS'), join(baseDir, 'Script'), join(homedir(), 'Downloads', 'AutoLeadPC', 'Script', 'Offers'), join(homedir(), 'Downloads', 'AutoLeadPC', 'Script', 'RRS'), join(homedir(), 'Downloads', 'AutoLeadPC', 'Script'), join(homedir(), 'Desktop', 'AutoLeadPC', 'Script')];
    const scriptEntries = [];
    for (const dir of candidates) {
      try {
        const names = await readdir(dir);
        for (const name of names) {
          if (name.endsWith('.txt')) scriptEntries.push({
            dir,
            name,
            path: join(dir, name)
          });
        }
      } catch {}
    }
    respondWithJson(response, 200, {
      scripts: scriptEntries
    });
    return true;
  }
  return false;
}
