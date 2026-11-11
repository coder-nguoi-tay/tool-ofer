import { bandwidthDailyStats } from '../../../monitoring/bandwidth.mjs';
import { getLocalDateKey } from '../../../monitoring/bandwidth.mjs';
import { queueSaveBandwidthStats } from '../../../monitoring/bandwidth.mjs';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API bandwidth-reset.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostBandwidthReset(request, response) {
  if (request.method === 'POST' && request.url === '/bandwidth/reset') {
    try {
      const bodyText = await readRequestBody(request).catch(() => '{}');
      const body = JSON.parse(bodyText || '{}');
      const scope = body.scope || 'today';
      const todayKey = getLocalDateKey();
      if (scope === 'today') {
        if (bandwidthDailyStats.daily[todayKey]) {
          const todayOld = bandwidthDailyStats.daily[todayKey];
          bandwidthDailyStats.totalBytesAllTime = Math.max(0, bandwidthDailyStats.totalBytesAllTime - (todayOld.totalBytes || 0));
          bandwidthDailyStats.totalUploadAllTime = Math.max(0, bandwidthDailyStats.totalUploadAllTime - (todayOld.bytesSent || 0));
          bandwidthDailyStats.totalDownloadAllTime = Math.max(0, bandwidthDailyStats.totalDownloadAllTime - (todayOld.bytesReceived || 0));
          bandwidthDailyStats.totalRequestsAllTime = Math.max(0, bandwidthDailyStats.totalRequestsAllTime - (todayOld.requestCount || 0));
          delete bandwidthDailyStats.daily[todayKey];
        }
      } else if (scope === 'all') {
        bandwidthDailyStats.totalBytesAllTime = 0;
        bandwidthDailyStats.totalUploadAllTime = 0;
        bandwidthDailyStats.totalDownloadAllTime = 0;
        bandwidthDailyStats.totalRequestsAllTime = 0;
        bandwidthDailyStats.daily = {};
      }
      queueSaveBandwidthStats();
      respondWithJson(response, 200, {
        ok: true,
        message: `Đã đặt lại dữ liệu băng thông (${scope}).`
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
