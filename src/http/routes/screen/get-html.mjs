import { resolveDebugPage } from '../../../browser/screen/resolve-debug-page.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { readEvidenceWithTimeout } from '../../../logging/recorder/read-evidence-with-timeout.mjs';

/**
 * Đọc DOM hiện tại của frame được chọn để sao chép/tải HTML khi người dùng yêu cầu.
 * @param {object} request GET của slot và chỉ số frame; không tự ghi file/log.
 * @param {object} response HTML dạng JSON để giao diện hiển thị bằng textarea an toàn.
 * @return {Promise<boolean>} True nếu route đã xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function handleGetScreenHtml(request, response) {
  const url = new URL(request.url, 'http://localhost');
  const match = url.pathname.match(/^\/screen\/html\/(\d+)$/);
  if (request.method !== 'GET' || !match) return false;
  const page = resolveDebugPage(Number(match[1]));
  if (!page) { respondWithJson(response, 404, { error: 'Tab trình duyệt đã đóng.' }); return true; }
  const frames = page.frames();
  const index = Number(url.searchParams.get('frame') || 0);
  if (!Number.isInteger(index) || index < 0 || !frames[index]) {
    respondWithJson(response, 400, { error: 'Frame không còn tồn tại. Hãy tải lại danh sách.' });
    return true;
  }
  try {
    const frame = frames[index];
    const html = await readEvidenceWithTimeout(frame, 'html', () => frame.content());
    respondWithJson(response, 200, { html, frame: index, frames: frames.map((item, frameIndex) => ({ index: frameIndex, url: item.url() })) });
  } catch { respondWithJson(response, 409, { error: 'Trang đang chuyển hướng hoặc chưa đọc được HTML. Hãy thử lại.' }); }
  return true;
}
