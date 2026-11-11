import { openLogsHtmlDirectoryInFinder } from '../../../logging/browser-logs.mjs';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API browser-logs-open-folder.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostBrowserLogsOpenFolder(request, response) {
  if (request.method === 'POST' && request.url === '/browser-logs/open-folder') {
    try {
      const rawBody = await readRequestBody(request).catch(() => '{}');
      const body = rawBody ? JSON.parse(rawBody) : {};
      await openLogsHtmlDirectoryInFinder(body.offer);
      respondWithJson(response, 200, {
        success: true,
        message: body.offer ? `Đã mở thư mục HTML của Offer ${body.offer} trong Finder.` : 'Đã mở thư mục lưu file HTML trong Finder.'
      });
    } catch (err) {
      respondWithJson(response, 500, {
        error: err.message
      });
    }
    return true;
  }
  return false;
}
