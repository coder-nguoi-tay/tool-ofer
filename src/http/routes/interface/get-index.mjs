import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { userInterfacePath } from '../../../runtime/constants/user-interface-path.mjs';
import { userInterfacePcPath } from '../../../runtime/constants/user-interface-pc-path.mjs';

/**
 * Xử lý API interface.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @param {object} context Các giá trị khởi tạo của máy chủ.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetInterfaceIndex(request, response, {
  interfacePcHtml,
  interfaceHtml
}) {
  if (request.method === 'GET' && (request.url === '/' || request.url === '/pc' || request.url === '/mac')) {
    const servePc = request.url !== '/mac';
    const targetHtmlPath = servePc ? userInterfacePcPath : userInterfacePath;
    const htmlContent = existsSync(targetHtmlPath) ? readFileSync(targetHtmlPath, 'utf8') : servePc ? interfacePcHtml : interfaceHtml;
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store'
    });
    response.end(htmlContent);
    return true;
  }
  return false;
}
