/**
 * Host tốn băng thông nhất hôm nay theo số đo tại relay: phiên đã đóng (đã cộng vào ngày) + phiên đang chạy.
 *
 * @param {{relayHosts?: Object<string, number>}|undefined} day Thống kê ngày hôm nay.
 * @param {Array<{readRelayBytes?: () => {hosts: Object<string, {up: number, down: number}>}}>} sessions Phiên đang mở.
 * @param {number} [limit=20] Số host trả về.
 * @return {Array<{host: string, bytes: number}>} Host xếp giảm dần theo byte.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
export function getTopRelayHosts(day, sessions, limit = 20) {
  const totals = { ...(day?.relayHosts || {}) };
  for (const session of sessions) {
    let live = null;
    try { live = session.readRelayBytes?.(); } catch {}
    for (const [host, bytes] of Object.entries(live?.hosts || {})) totals[host] = (totals[host] || 0) + (bytes.up || 0) + (bytes.down || 0);
  }
  return Object.entries(totals).map(([host, bytes]) => ({ host, bytes })).sort((a, b) => b.bytes - a.bytes).slice(0, limit);
}
