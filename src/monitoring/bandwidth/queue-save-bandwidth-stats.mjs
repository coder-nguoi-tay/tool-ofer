import { appDataDirectory } from '../../config/paths.mjs';
import { bandwidthDailyStats } from './state/bandwidth-daily-stats.mjs';
import { bandwidthStatsPath } from './state/bandwidth-stats-path.mjs';
import { mkdir } from 'node:fs/promises';
import { moduleState } from './state/module-state.mjs';
import { skipBandwidthPersist } from './state/skip-bandwidth-persist.mjs';
import { writeFile } from 'node:fs/promises';

/**
 * Gộp các lượt lưu thống kê băng thông gần nhau.
 * @return {void} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function queueSaveBandwidthStats() {
  if (moduleState.saveBandwidthTimer || skipBandwidthPersist) return;
  moduleState.saveBandwidthTimer = setTimeout(async () => {
    moduleState.saveBandwidthTimer = null;
    try {
      await mkdir(appDataDirectory, {
        recursive: true
      });
      await writeFile(bandwidthStatsPath, JSON.stringify(bandwidthDailyStats, null, 2), 'utf8');
    } catch (err) {
      console.warn('[Bandwidth] Lỗi khi lưu bandwidth-daily.json:', err.message);
    }
  }, 2000);
}
export { queueSaveBandwidthStats };
