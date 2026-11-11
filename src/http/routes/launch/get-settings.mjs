import { existsSync } from 'node:fs';
import { lastLaunchSettingsPath } from '../../../runtime/constants/last-launch-settings-path.mjs';
import { readFileSync } from 'node:fs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API launch-settings.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetLaunchSettings(request, response) {
  if (request.method === 'GET' && request.url === '/launch-settings') {
    try {
      if (existsSync(lastLaunchSettingsPath)) {
        const raw = JSON.parse(readFileSync(lastLaunchSettingsPath, 'utf8'));
        respondWithJson(response, 200, {
          ok: true,
          settings: raw.settings,
          savedAt: raw.savedAt
        });
        return true;
      }
    } catch {}
    respondWithJson(response, 200, {
      ok: true,
      settings: null
    });
    return true;
  }
  return false;
}
