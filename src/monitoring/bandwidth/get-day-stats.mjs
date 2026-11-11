import { bandwidthDailyStats } from './state/bandwidth-daily-stats.mjs';

/**
 * Lấy hoặc khởi tạo bản thống kê của một ngày.
 * @param {string} dateKey Khóa ngày thống kê.
 * @return {object} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function getDayStats(dateKey) {
  if (!bandwidthDailyStats.daily[dateKey]) {
    bandwidthDailyStats.daily[dateKey] = {
      date: dateKey,
      bytesSent: 0,
      bytesReceived: 0,
      totalBytes: 0,
      requestCount: 0
    };
  }
  return bandwidthDailyStats.daily[dateKey];
}
export { getDayStats };
