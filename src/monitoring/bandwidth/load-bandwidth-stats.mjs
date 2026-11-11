import { bandwidthDailyStats } from './state/bandwidth-daily-stats.mjs';
import { bandwidthStatsPath } from './state/bandwidth-stats-path.mjs';
import { formatBytes } from './format-bytes.mjs';
import { readFile } from 'node:fs/promises';

/**
 * Nạp thống kê băng thông đã lưu cho instance hiện tại.
 * @return {Promise<void>} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function loadBandwidthStats() {
  try {
    const raw = JSON.parse(await readFile(bandwidthStatsPath, 'utf8'));
    if (raw && typeof raw === 'object') {
      bandwidthDailyStats.totalBytesAllTime = Number(raw.totalBytesAllTime) || 0;
      bandwidthDailyStats.totalUploadAllTime = Number(raw.totalUploadAllTime) || 0;
      bandwidthDailyStats.totalDownloadAllTime = Number(raw.totalDownloadAllTime) || 0;
      bandwidthDailyStats.totalRequestsAllTime = Number(raw.totalRequestsAllTime) || 0;
      bandwidthDailyStats.daily = raw.daily && typeof raw.daily === 'object' ? raw.daily : {};
      bandwidthDailyStats.last711Balance = typeof raw.last711Balance === 'number' ? raw.last711Balance : null;
    }
    console.log(`[Bandwidth] Đã tải thống kê băng thông (${Object.keys(bandwidthDailyStats.daily).length} ngày, tổng all-time: ${formatBytes(bandwidthDailyStats.totalBytesAllTime)})`);
  } catch {}
}
export { loadBandwidthStats };
