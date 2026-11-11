import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { userInterfaceMiniPath } from '../../../runtime/constants/user-interface-mini-path.mjs';

/**
 * Xử lý API screen-mini.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetScreenMini(request, response) {
  if ((request.method === 'GET' || request.method === 'HEAD') && (request.url === '/screen-mini' || request.url === '/mini')) {
    if (existsSync(userInterfaceMiniPath)) {
      const miniContent = readFileSync(userInterfaceMiniPath, 'utf8');
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store'
      });
      response.end(request.method === 'HEAD' ? undefined : miniContent);
      return true;
    }
    response.writeHead(404);
    response.end();
    return true;
  }
  return false;
}
