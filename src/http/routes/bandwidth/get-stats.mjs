import { activeBrowsers } from '../../../browser/sessions.mjs';
import { formatBytes } from '../../../monitoring/bandwidth.mjs';
import { getBandwidthSummary } from '../../../runtime/actions/get-bandwidth-summary.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API bandwidth-stats.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetBandwidthStats(request, response) {
  if (request.method === 'GET' && request.url === '/bandwidth/stats') {
    const summary = getBandwidthSummary();
    const sessionsBw = [...activeBrowsers].filter(session => !session.isClosed && (session.exitIp || session.isManagedProfile || session.slot)).map(session => {
      const livePages = session.browser?.pages ? session.browser.pages().filter(p => !p.isClosed()) : [];
      return {
        slot: session.slot ?? session.tileIndex + 1,
        exitIp: session.exitIp || 'Direct',
        proxy: session.proxyServer || session.proxyKey || 'Direct',
        totalBytes: session.bandwidthBytes || 0,
        formatted: formatBytes(session.bandwidthBytes || 0),
        bytesSent: session.bytesSent || 0,
        bytesReceived: session.bytesReceived || 0,
        requestCount: session.requestCount || 0,
        tabs: livePages.map((p, idx) => ({
          index: idx,
          url: (typeof p.url === 'function' ? p.url() : '') || '',
          totalBytes: p._bandwidthBytes || 0,
          formatted: formatBytes(p._bandwidthBytes || 0),
          bytesSent: p._bytesSent || 0,
          bytesReceived: p._bytesReceived || 0,
          requestCount: p._requestCount || 0
        }))
      };
    }).sort((a, b) => a.slot - b.slot);
    respondWithJson(response, 200, {
      ...summary,
      activeSlots: sessionsBw
    });
    return true;
  }
  return false;
}
