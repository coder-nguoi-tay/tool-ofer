import { bandwidthDailyStats } from '../../monitoring/bandwidth.mjs';
import { formatBytes } from '../../monitoring/bandwidth.mjs';
import { getCached711Balance } from '../../proxy/provider711.mjs';
import { getLocalDateKey } from '../../monitoring/bandwidth.mjs';

/**
 * Get bandwidth summary.
 * @return {*} Kết quả xử lý get bandwidth summary.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function getBandwidthSummary() {
  const todayKey = getLocalDateKey();
  const todayStats = bandwidthDailyStats.daily[todayKey] || {
    date: todayKey,
    bytesSent: 0,
    bytesReceived: 0,
    totalBytes: 0,
    requestCount: 0
  };
  const dailyList = Object.values(bandwidthDailyStats.daily).map(d => ({
    ...d,
    formatted: formatBytes(d.totalBytes || 0),
    sentFormatted: formatBytes(d.bytesSent || 0),
    receivedFormatted: formatBytes(d.bytesReceived || 0),
    proxy711Bytes: d.proxy711Bytes || 0,
    proxy711Formatted: formatBytes(d.proxy711Bytes || 0),
    relayBytes: (d.relayBytesSent || 0) + (d.relayBytesReceived || 0),
    relayFormatted: formatBytes((d.relayBytesSent || 0) + (d.relayBytesReceived || 0))
  })).sort((a, b) => b.date.localeCompare(a.date));
  return {
    today: {
      ...todayStats,
      formatted: formatBytes(todayStats.totalBytes || 0),
      sentFormatted: formatBytes(todayStats.bytesSent || 0),
      receivedFormatted: formatBytes(todayStats.bytesReceived || 0),
      proxy711Bytes: todayStats.proxy711Bytes || 0,
      proxy711Formatted: formatBytes(todayStats.proxy711Bytes || 0),
      relayBytes: (todayStats.relayBytesSent || 0) + (todayStats.relayBytesReceived || 0),
      relayFormatted: formatBytes((todayStats.relayBytesSent || 0) + (todayStats.relayBytesReceived || 0))
    },
    allTime: {
      totalBytes: bandwidthDailyStats.totalBytesAllTime,
      bytesSent: bandwidthDailyStats.totalUploadAllTime,
      bytesReceived: bandwidthDailyStats.totalDownloadAllTime,
      requestCount: bandwidthDailyStats.totalRequestsAllTime,
      formatted: formatBytes(bandwidthDailyStats.totalBytesAllTime),
      sentFormatted: formatBytes(bandwidthDailyStats.totalUploadAllTime),
      receivedFormatted: formatBytes(bandwidthDailyStats.totalDownloadAllTime)
    },
    daily: dailyList,
    proxy711: getCached711Balance()
  };
}
