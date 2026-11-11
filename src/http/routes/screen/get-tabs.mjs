import { activeBrowsers } from '../../../browser/sessions.mjs';
import { formatBytes } from '../../../monitoring/bandwidth.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API screen-tabs.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetScreenTabs(request, response) {
  if (request.method === 'GET' && request.url.startsWith('/screen/tabs/')) {
    const slot = parseInt(request.url.split('/').pop(), 10);
    const session = [...activeBrowsers].find(s => !s.isClosed && (s.slot ?? s.tileIndex + 1) === slot);
    if (!session) {
      respondWithJson(response, 404, {
        error: 'not found'
      });
      return true;
    }
    const pages = session.browser.pages().filter(p => !p.isClosed());
    const tabs = await Promise.all(pages.map(async (p, i) => ({
      index: i,
      url: p.url(),
      title: await p.title().catch(() => p.url()),
      bandwidthBytes: p._bandwidthBytes || 0,
      bandwidthFormatted: formatBytes(p._bandwidthBytes || 0),
      bytesSent: p._bytesSent || 0,
      bytesReceived: p._bytesReceived || 0,
      requestCount: p._requestCount || 0
    })));
    respondWithJson(response, 200, {
      tabs,
      bandwidthBytes: session.bandwidthBytes || 0,
      bandwidthFormatted: formatBytes(session.bandwidthBytes || 0),
      bytesSent: session.bytesSent || 0,
      bytesReceived: session.bytesReceived || 0,
      requestCount: session.requestCount || 0
    });
    return true;
  }
  return false;
}
