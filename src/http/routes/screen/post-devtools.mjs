import { resolveDebugPage } from '../../../browser/screen/resolve-debug-page.mjs';
import { openPageDevtools } from '../../../browser/screen/open-page-devtools.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Nhận F12 của Screen View để mở DevTools tab đích hoặc chuyển sang bảng HTML.
 * @param {object} request Yêu cầu HTTP của slot đang xem.
 * @param {object} response Phản hồi chế độ native/html hoặc phiên không còn.
 * @return {Promise<boolean>} True nếu route đã xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function handlePostScreenDevtools(request, response) {
  const match = request.url.match(/^\/screen\/devtools\/(\d+)$/);
  if (request.method !== 'POST' || !match) return false;
  const page = resolveDebugPage(Number(match[1]));
  if (!page) respondWithJson(response, 404, { error: 'Tab trình duyệt đã đóng.' });
  else respondWithJson(response, 200, { mode: await openPageDevtools(page) ? 'native' : 'html' });
  return true;
}
