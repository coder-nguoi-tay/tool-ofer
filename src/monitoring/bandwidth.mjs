import { saveBandwidthStatsSync } from './bandwidth/save-bandwidth-stats-sync.mjs';
export { bandwidthStatsPath } from './bandwidth/state/bandwidth-stats-path.mjs';
export { bandwidthDailyStats } from './bandwidth/state/bandwidth-daily-stats.mjs';
export { formatBytes } from './bandwidth/format-bytes.mjs';
export { getLocalDateKey } from './bandwidth/get-local-date-key.mjs';
export { loadBandwidthStats } from './bandwidth/load-bandwidth-stats.mjs';
export { queueSaveBandwidthStats } from './bandwidth/queue-save-bandwidth-stats.mjs';
export { saveBandwidthStatsSync } from './bandwidth/save-bandwidth-stats-sync.mjs';
export { getDayStats } from './bandwidth/get-day-stats.mjs';
export { recordBandwidthUsage } from './bandwidth/record-bandwidth-usage.mjs';
export { attachBandwidthTracker } from './bandwidth/attach-bandwidth-tracker.mjs';
process.on('exit', () => {
  saveBandwidthStatsSync();
});
