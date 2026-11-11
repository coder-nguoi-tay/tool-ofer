import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';

/**
 * Xử lý API pc-app-png.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetPcAppPng(request, response) {
  if (request.method === 'GET' && request.url === '/pc-app.png') {
    try {
      const iconPath = new URL('./pc-app.png', new URL('../../../app.mjs', import.meta.url).href);
      if (existsSync(iconPath)) {
        const iconBuf = readFileSync(iconPath);
        response.writeHead(200, {
          'content-type': 'image/png',
          'cache-control': 'max-age=86400'
        });
        response.end(iconBuf);
        return true;
      }
    } catch {
      // ignore
    }
    response.writeHead(404);
    response.end();
    return true;
  }
  return false;
}
