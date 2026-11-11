/**
 * Xử lý API favicon-ico.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetFaviconIco(request, response) {
  if (request.method === 'GET' && request.url === '/favicon.ico') {
    response.writeHead(204);
    response.end();
    return true;
  }
  return false;
}
