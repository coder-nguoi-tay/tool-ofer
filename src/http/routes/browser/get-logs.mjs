import { countSavedHtmlFiles } from '../../../logging/browser-logs.mjs';
import { interactionHtmlDirectory } from '../../../logging/browser-logs.mjs';
import { persistedBrowserLogs } from '../../../logging/browser-logs.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API browser-logs.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetBrowserLogs(request, response) {
  if (request.method === 'GET' && request.url === '/browser-logs') {
    const htmlCount = await countSavedHtmlFiles();
    respondWithJson(response, 200, {
      htmlDir: interactionHtmlDirectory,
      htmlCount,
      sessions: persistedBrowserLogs
    });
    return true;
  }
  return false;
}
