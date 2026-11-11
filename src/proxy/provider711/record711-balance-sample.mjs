import { bandwidthDailyStats } from '../../monitoring/bandwidth.mjs';
import { getDayStats } from '../../monitoring/bandwidth.mjs';
import { getLocalDateKey } from '../../monitoring/bandwidth.mjs';
import { proxy711 } from './state/proxy711.mjs';
import { queueSaveBandwidthStats } from '../../monitoring/bandwidth.mjs';
import { saveProxy711Config } from './save-proxy711-config.mjs';

/**
 * Ghi nhận lượng 711 thực trừ = phần số dư giảm giữa 2 lần poll số dư (đúng con số 711 tính tiền,
 * gồm mọi máy/instance dùng chung tài khoản). Số dư tăng = vừa nạp gói → cộng vào packageGb, không tính là tiêu hao.
 * ponytail: phần giảm trong lúc app tắt được dồn vào giờ của lần poll đầu tiên sau khi mở lại;
 * cần chính xác hơn thì phải gọi API thống kê của dashboard 711 (bắt buộc ký request + đăng nhập web).
 *
 * @param {number} flowBytes Số dư hiện tại (bytes) từ /wapi/balance/
 * @param {Date} [now]
 * @return {number} Số bytes tiêu hao ghi nhận được ở lần này
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function record711BalanceSample(flowBytes, now = new Date()) {
  if (typeof flowBytes !== 'number' || !Number.isFinite(flowBytes) || flowBytes < 0) return 0;
  const prev = bandwidthDailyStats.last711Balance;
  bandwidthDailyStats.last711Balance = flowBytes;
  queueSaveBandwidthStats();
  if (typeof prev !== 'number') return 0;
  const used = prev - flowBytes;
  if (used < 0) {
    proxy711.packageGb = Number(((Number(proxy711.packageGb) || 0) + -used / 1024 ** 3).toFixed(3));
    void saveProxy711Config();
    return 0;
  }
  if (used === 0) return 0;
  const day = getDayStats(getLocalDateKey(now));
  const hour = String(now.getHours()).padStart(2, '0');
  day.proxy711Bytes = (day.proxy711Bytes || 0) + used;
  day.proxy711Hours = day.proxy711Hours || {};
  day.proxy711Hours[hour] = (day.proxy711Hours[hour] || 0) + used;
  return used;
}
export { record711BalanceSample };
