import { bandwidthDailyStats } from '../../monitoring/bandwidth.mjs';
import { formatBytes } from '../../monitoring/bandwidth.mjs';
import { getLocalDateKey } from '../../monitoring/bandwidth.mjs';

/**
 * Lịch sử lượng 711 thực trừ theo giờ, dựng từ các lần poll số dư (record711BalanceSample).
 * API /wapi/consume/chart/ của 711 bỏ qua from/to và chỉ trả giờ hiện tại (= 0), còn API thống kê
 * của dashboard bắt buộc đăng nhập web + ký request → dùng dữ liệu tự ghi nhận, không cần đăng nhập web.
 *
 * @param {object} [options]
 * @param {number} [options.days=1] Số ngày lịch (tính cả hôm nay)
 * @return {Promise<object>} Dữ liệu tiêu hao theo giờ
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function get711ConsumptionChart({
  days = 1
} = {}) {
  const rawList = [];
  const dayCount = Math.min(60, Math.max(1, Number(days) || 1));
  for (let i = 0; i < dayCount; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const hours = bandwidthDailyStats.daily[getLocalDateKey(d)]?.proxy711Hours || {};
    for (const [hour, bytes] of Object.entries(hours)) {
      d.setHours(Number(hour), 0, 0, 0);
      const timestamp = Math.floor(d.getTime() / 1000);
      rawList.push({
        period: new Date(timestamp * 1000).toISOString(),
        timestamp,
        total_traffic_count: bytes
      });
    }
  }
  let totalBytes = 0;
  let peakBytes = 0;
  let peakHour = null;
  let peakPeriod = null;
  const items = rawList.map(entry => {
    const bytes = Number(entry.total_traffic_count) || 0;
    totalBytes += bytes;
    let localTime = entry.period;
    if (entry.timestamp) {
      const d = new Date(entry.timestamp * 1000);
      const nextD = new Date((entry.timestamp + 3600) * 1000);
      const pad = n => String(n).padStart(2, '0');
      localTime = `${pad(d.getHours())}:00 - ${pad(nextD.getHours())}:00 (${pad(d.getDate())}/${pad(d.getMonth() + 1)})`;
    }
    if (bytes > peakBytes) {
      peakBytes = bytes;
      peakHour = localTime;
      peakPeriod = entry.period;
    }
    const mb = Number((bytes / 1024 ** 2).toFixed(2));
    const gb = Number((bytes / 1024 ** 3).toFixed(3));
    return {
      period: entry.period,
      timestamp: entry.timestamp,
      localTime,
      bytes,
      formatted: formatBytes(bytes),
      mb,
      gb
    };
  });
  for (const item of items) {
    item.percent = totalBytes > 0 ? Number((item.bytes / totalBytes * 100).toFixed(1)) : 0;
  }
  items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  return {
    ok: true,
    totalBytes,
    totalFormatted: formatBytes(totalBytes),
    totalGb: Number((totalBytes / 1024 ** 3).toFixed(3)),
    peakBytes,
    peakFormatted: formatBytes(peakBytes),
    peakHour,
    peakPeriod,
    activeHoursCount: items.filter(i => i.bytes > 0).length,
    items
  };
}
export { get711ConsumptionChart };
