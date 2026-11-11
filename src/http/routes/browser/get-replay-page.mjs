import { readFile } from 'node:fs/promises';

/**
 * Mở giao diện xem lại hành động và bằng chứng của các phiên trình duyệt.
 * @param {object} request Yêu cầu HTTP.
 * @param {object} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi đã phục vụ trang xem lại.
 * @throws {Error} Khi thiếu tệp giao diện trong bản cài.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetReplayPage(request, response) {
  if (!['GET', 'HEAD'].includes(request.method) || request.url?.split('?')[0] !== '/browser-replay') return false;
  const html = await readFile(new URL('../../../../ui/replay/index.html', import.meta.url));
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  response.end(request.method === 'HEAD' ? undefined : html);
  return true;
}
