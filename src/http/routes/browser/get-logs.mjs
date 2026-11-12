import { countSavedHtmlFiles } from '../../../logging/browser-logs.mjs';
import { interactionHtmlDirectory } from '../../../logging/browser-logs.mjs';
import { persistedBrowserLogs } from '../../../logging/browser-logs.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { moduleState } from '../../../logging/browser-logs/state/module-state.mjs';
import { selectBrowserLogsDelta } from '../../../logging/browser-logs/select-browser-logs-delta.mjs';

/**
 * Xử lý API browser-logs.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetBrowserLogs(request, response) {
  if (request.method !== 'GET') return false;
  const { pathname, searchParams } = new URL(request.url, 'http://localhost');
  if (pathname !== '/browser-logs') return false;
  const htmlCount = await countSavedHtmlFiles();
  const base = { htmlDir: interactionHtmlDirectory, htmlCount, seq: moduleState.logSeq, epoch: moduleState.logEpoch };
  // Tab Log hỏi mỗi 2 giây: có since + đúng epoch thì chỉ trả phần mới (5 MB → vài trăm byte khi không có gì mới).
  // since vượt seq hiện tại hoặc epoch khác = app đã khởi động lại → trả đủ.
  const since = Number(searchParams.get('since'));
  const sameEpoch = searchParams.get('epoch') === String(moduleState.logEpoch);
  if (searchParams.has('since') && Number.isFinite(since) && since >= 0 && since <= moduleState.logSeq && sameEpoch) {
    respondWithJson(response, 200, { ...base, since, ...selectBrowserLogsDelta(persistedBrowserLogs, since) });
    return true;
  }
  respondWithJson(response, 200, { ...base, sessions: persistedBrowserLogs });
  return true;
}
