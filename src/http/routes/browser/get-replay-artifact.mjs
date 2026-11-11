import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative } from 'node:path';
import { interactionHtmlDirectory } from '../../../logging/browser-logs/state/interaction-html-directory.mjs';
import { getSessionReplay } from '../../../logging/replay/get-session-replay.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Phục vụ ảnh/HTML bằng chứng của đúng sự kiện, chỉ đọc tệp trong thư mục log.
 * HTML tải về dạng văn bản, không thực thi mã của trang đích trong ứng dụng.
 * @param {object} request Yêu cầu HTTP chứa sessionId, eventId và kind.
 * @param {object} response Phản hồi ảnh hoặc tệp HTML.
 * @return {Promise<boolean>} True khi đã xử lý tuyến bằng chứng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetReplayArtifact(request, response) {
  if (!['GET', 'HEAD'].includes(request.method)) return false;
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname !== '/browser-replay/artifact') return false;
  const events = getSessionReplay(url.searchParams.get('sessionId'))?.events || [];
  const entry = events.find(event => event.id === url.searchParams.get('eventId'));
  const evidence = entry?.snapshotEventId ? events.find(event => event.id === entry.snapshotEventId) : entry;
  const screenshot = url.searchParams.get('kind') === 'screenshot';
  const filename = evidence?.[screenshot ? 'screenshotPath' : 'htmlPath'];
  try {
    if (!filename || !['screenshot', 'html'].includes(url.searchParams.get('kind'))) throw new Error('missing');
    const [directory, file] = await Promise.all([realpath(interactionHtmlDirectory), realpath(filename)]);
    const childPath = relative(directory, file);
    if (childPath.startsWith('..') || isAbsolute(childPath)) throw new Error('outside log directory');
    const content = await readFile(file);
    response.writeHead(200, {
      'content-type': screenshot ? 'image/jpeg' : 'text/plain; charset=utf-8',
      'content-disposition': screenshot ? 'inline' : 'attachment; filename="page-snapshot.html"',
      'cache-control': 'no-store', 'x-content-type-options': 'nosniff', "content-security-policy": "default-src 'none'; sandbox",
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch { respondWithJson(response, 404, { error: 'Bằng chứng chưa được chụp hoặc tệp đã bị xóa.' }); }
  return true;
}
