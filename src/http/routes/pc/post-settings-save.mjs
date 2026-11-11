import { dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { getAutoLeadPCDir } from '../../../config/paths.mjs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { saveAdsPowerApiKey } from '../../../runtime/actions/save-ads-power-api-key.mjs';
import { writeFileSync } from 'node:fs';

/**
 * Xử lý API pc-settings-save.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostPcSettingsSave(request, response) {
  if (request.method === 'POST' && request.url === '/pc/settings/save') {
    try {
      const body = JSON.parse(await readRequestBody(request));
      if (body.AdsPowerApiKey !== undefined) await saveAdsPowerApiKey(body.AdsPowerApiKey);
      const baseDir = getAutoLeadPCDir();
      const filePath = join(baseDir, 'Config', 'Settings', 'Settings.ini');
      const b = val => val ? 'True' : 'False';
      const bm = body.browserMode || 'Chrome';
      const content = `[Browser]\nChrome=${b(bm === 'Chrome')}\nChromeAdsPower=${b(bm === 'AdsPower')}\nChromeFirefox=${b(bm === 'Firefox')}\n[Setting]\nCloakBrowser=${b(body.CloakBrowser)}\nCanvas=${b(body.Canvas)}\nClientRects=${b(body.ClientRects)}\nWebGLImage=${b(body.WebGLImage)}\nFonts=${b(body.Fonts)}\nWebRTC=${b(body.WebRTC)}\nApiFakeIP=${b(body.ApiFakeIP)}\n[OperatingSystem]\nWindows=${b(body.Windows)}\nMac=${b(body.Mac)}\nLinux=${b(body.Linux)}\nAndroid=${b(body.Android)}\niPhone=${b(body.iPhone)}\niPad=${b(body.iPad)}\n`;
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, {
          recursive: true
        });
      }
      writeFileSync(filePath, content, 'utf8');

      // Đồng bộ thêm vào thư mục config phụ nếu tồn tại
      const altDir = baseDir.includes('.autoleadpc') ? join(homedir(), 'Downloads', 'AutoLeadPC') : join(homedir(), '.autoleadpc');
      const altPath = join(altDir, 'Config', 'Settings', 'Settings.ini');
      if (existsSync(dirname(altPath))) {
        try {
          writeFileSync(altPath, content, 'utf8');
        } catch {}
      }
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
