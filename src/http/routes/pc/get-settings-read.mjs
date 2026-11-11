import { existsSync } from 'node:fs';
import { getAutoLeadPCDir } from '../../../config/paths.mjs';
import { join } from 'node:path';
import { readAdsPowerApiKey } from '../../../runtime/actions/read-ads-power-api-key.mjs';
import { readFileSync } from 'node:fs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API pc-settings-read.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetPcSettingsRead(request, response) {
  if (request.method === 'GET' && request.url === '/pc/settings/read') {
    try {
      const baseDir = getAutoLeadPCDir();
      const filePath = join(baseDir, 'Config', 'Settings', 'Settings.ini');
      let text = '';
      if (existsSync(filePath)) {
        text = readFileSync(filePath, 'utf8');
      }
      const getBool = key => {
        const m = text.match(new RegExp(`^${key}=(True|False)`, 'mi'));
        return m ? m[1].toLowerCase() === 'true' : false;
      };
      const getStr = key => {
        const m = text.match(new RegExp(`^${key}=(.+)`, 'mi'));
        return m ? m[1].trim() : '';
      };
      respondWithJson(response, 200, {
        Chrome: getBool('Chrome'),
        ChromeFirefox: getBool('ChromeFirefox'),
        ChromeAdsPower: getBool('ChromeAdsPower'),
        CloakBrowser: getBool('CloakBrowser'),
        Canvas: getBool('Canvas'),
        ClientRects: getBool('ClientRects'),
        WebGLImage: getBool('WebGLImage'),
        Fonts: getBool('Fonts'),
        WebRTC: getBool('WebRTC'),
        ApiFakeIP: getBool('ApiFakeIP'),
        Windows: getBool('Windows'),
        Mac: getBool('Mac'),
        Linux: getBool('Linux'),
        Android: getBool('Android'),
        iPhone: getBool('iPhone'),
        iPad: getBool('iPad'),
        AdsPowerApiKey: await readAdsPowerApiKey()
      });
    } catch (err) {
      respondWithJson(response, 200, {});
    }
    return true;
  }
  return false;
}
