import { getDayStats } from './get-day-stats.mjs';
import { getLocalDateKey } from './get-local-date-key.mjs';
import { queueSaveBandwidthStats } from './queue-save-bandwidth-stats.mjs';

const MAX_HOSTS = 500;
const KEEP_HOSTS = 300;

/**
 * Cộng số byte đo tại relay (số proxy thực sự nhìn thấy) của một phiên vừa đóng vào thống kê ngày, theo host.
 * Gọi khi đóng relay; phiên đang chạy đọc trực tiếp qua `session.readRelayBytes()`.
 *
 * @param {{up: number, down: number, hosts: Object<string, {up: number, down: number}>}|null|undefined} snapshot Kết quả `relay.readBytes()`.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
export function recordRelayUsage(snapshot) {
  if (!snapshot || !(snapshot.up > 0 || snapshot.down > 0)) return;
  const day = getDayStats(getLocalDateKey());
  day.relayBytesSent = (day.relayBytesSent || 0) + snapshot.up;
  day.relayBytesReceived = (day.relayBytesReceived || 0) + snapshot.down;
  day.relayHosts = day.relayHosts || {};
  for (const [host, bytes] of Object.entries(snapshot.hosts || {})) day.relayHosts[host] = (day.relayHosts[host] || 0) + (bytes.up || 0) + (bytes.down || 0);
  // ponytail: giữ tối đa 300 host lớn nhất khi vượt 500, đủ cho bảng "host tốn nhất"; không lưu lịch sử từng host theo giờ.
  const entries = Object.entries(day.relayHosts);
  if (entries.length > MAX_HOSTS) day.relayHosts = Object.fromEntries(entries.sort((a, b) => b[1] - a[1]).slice(0, KEEP_HOSTS));
  queueSaveBandwidthStats();
}
