import { readFile } from 'node:fs/promises';

/**
 * Phục vụ giao diện xem tài liệu Kế hoạch Obscura Core Rust (100% GoLogin Parity).
 * @param {object} request Yêu cầu HTTP.
 * @param {object} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi đã phục vụ trang.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export async function handleGetPlanPage(request, response) {
  const path = request.url?.split('?')[0];
  if (!['GET', 'HEAD'].includes(request.method) || (path !== '/plan' && path !== '/obscura-plan')) {
    return false;
  }
  const html = await readFile(new URL('../../../../ui/plan/index.html', import.meta.url));
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  response.end(request.method === 'HEAD' ? undefined : html);
  return true;
}