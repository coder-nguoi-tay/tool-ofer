import { createBrowserLogsArchive } from '../../../logging/browser-logs.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API browser-logs-download-all.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetBrowserLogsDownloadAll(request, response) {
  if (request.method === 'GET' && request.url === '/browser-logs/download-all') {
    try {
      const archive = await createBrowserLogsArchive();
      response.writeHead(200, {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="autoleadpc-interfaces-${new Date().toISOString().slice(0, 10)}.zip"`,
        'content-length': archive.length,
        'cache-control': 'no-store'
      });
      response.end(archive);
    } catch (err) {
      respondWithJson(response, 500, {
        success: false,
        error: err.message
      });
    }
    return true;
  }
  return false;
}
