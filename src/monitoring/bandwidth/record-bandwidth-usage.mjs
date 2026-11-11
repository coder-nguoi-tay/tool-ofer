import { bandwidthDailyStats } from './state/bandwidth-daily-stats.mjs';
import { getDayStats } from './get-day-stats.mjs';
import { getLocalDateKey } from './get-local-date-key.mjs';
import { queueSaveBandwidthStats } from './queue-save-bandwidth-stats.mjs';

/**
 * Cộng lưu lượng và số yêu cầu vào thống kê ngày và tổng.
 * @param {number} bytes Tổng lưu lượng.
 * @param {number} up Lưu lượng tải lên.
 * @param {number} down Lưu lượng tải xuống.
 * @return {void} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function recordBandwidthUsage(bytes, up = 0, down = 0) {
  if (bytes <= 0 && up <= 0 && down <= 0) return;
  const day = getDayStats(getLocalDateKey());
  day.bytesSent = (day.bytesSent || 0) + up;
  day.bytesReceived = (day.bytesReceived || 0) + down;
  day.totalBytes = (day.totalBytes || 0) + bytes;
  day.requestCount = (day.requestCount || 0) + 1;
  bandwidthDailyStats.totalUploadAllTime += up;
  bandwidthDailyStats.totalDownloadAllTime += down;
  bandwidthDailyStats.totalBytesAllTime += bytes;
  bandwidthDailyStats.totalRequestsAllTime += 1;
  queueSaveBandwidthStats();
}
export { recordBandwidthUsage };
