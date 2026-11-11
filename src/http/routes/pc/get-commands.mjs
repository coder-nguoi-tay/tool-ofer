import { existsSync } from 'node:fs';
import { getAutoLeadPCDir } from '../../../config/paths.mjs';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API pc-commands.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetPcCommands(request, response) {
  if (request.method === 'GET' && request.url === '/pc/commands') {
    try {
      const baseDir = getAutoLeadPCDir();
      const cmdPath = join(baseDir, 'Config', 'Command', 'command.txt');
      let text = '';
      if (existsSync(cmdPath)) {
        text = readFileSync(cmdPath, 'utf8');
      }
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const commands = lines.map((line, idx) => {
        let name = line;
        let template = line;
        if (line.startsWith('{')) {
          const m = line.match(/^\{([^}=]+)\}(?:=(.*))?$/);
          if (m) {
            name = `{${m[1]}}`;
            template = line;
          }
        } else if (line.startsWith('RandomTextFile')) {
          name = 'RandomTextFile';
        }
        return {
          id: idx + 1,
          name,
          template,
          raw: line
        };
      });
      respondWithJson(response, 200, {
        commands
      });
    } catch (err) {
      respondWithJson(response, 200, {
        commands: []
      });
    }
    return true;
  }
  return false;
}
