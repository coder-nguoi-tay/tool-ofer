import { appDataDirectory } from '../../config/paths.mjs';
import { bandwidthDailyStats } from './state/bandwidth-daily-stats.mjs';
import { bandwidthStatsPath } from './state/bandwidth-stats-path.mjs';
import { mkdirSync } from 'node:fs';
import { skipBandwidthPersist } from './state/skip-bandwidth-persist.mjs';
import { writeFileSync } from 'node:fs';

/**
 * Lưu thống kê băng thông trước khi tiến trình thoát.
 * @return {void} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function saveBandwidthStatsSync() {
  if (skipBandwidthPersist) return;
  try {
    mkdirSync(appDataDirectory, {
      recursive: true
    });
    writeFileSync(bandwidthStatsPath, JSON.stringify(bandwidthDailyStats, null, 2), 'utf8');
  } catch {}
}
export { saveBandwidthStatsSync };
