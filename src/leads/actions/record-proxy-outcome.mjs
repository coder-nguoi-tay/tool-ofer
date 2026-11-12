import { protectConfirmedLeadSession } from './protect-confirmed-lead-session.mjs';
import { readProxyUsageHistory } from '../../proxy/actions/read-proxy-usage-history.mjs';
import { persistProxyUsageHistory } from '../../proxy/actions/persist-proxy-usage-history.mjs';

/**
 * Ghi kết quả đóng phiên vào lịch sử proxy (một chỗ thay cho 5 khối chép trong watcher).
 * Kiểm lại bảo vệ lead sau khi đọc file: IP vừa có lead thì không ghi đè và báo caller dừng đóng.
 *
 * @param {object} session Phiên có proxyKey.
 * @param {string} status Trạng thái lịch sử (failed, duplicate_ip, completed, offer_unavailable…).
 * @param {string} reason Lý do hiển thị.
 * @param {{read?: Function, persist?: Function}} [io] Hàm đọc/ghi lịch sử (mặc định file thật của app).
 * @return {Promise<boolean>} True nếu IP vừa thành lead đã xác nhận: caller phải dừng, không đóng phiên.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function recordProxyOutcome(session, status, reason, { read = readProxyUsageHistory, persist = persistProxyUsageHistory } = {}) {
  if (!session.proxyKey) return false;
  try {
    const history = await read();
    if (protectConfirmedLeadSession(session)) return true;
    if (history?.proxies?.[session.proxyKey]) {
      history.proxies[session.proxyKey] = {
        ...history.proxies[session.proxyKey],
        status,
        reason,
        completedAt: new Date().toISOString()
      };
      await persist(history);
    }
  } catch {}
  return false;
}

/**
 * Nhãn ngắn của phiên cho log/badge: Chrome <version> → Profile <id> → Slot <n>.
 *
 * @param {object} session Phiên trình duyệt.
 * @return {string} Nhãn hiển thị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function sessionLabel(session) {
  if (session.chromeVersion) return `Chrome ${session.chromeVersion}`;
  if (session.profileId) return `Profile ${session.profileId}`;
  return `Slot ${session.slot ?? (session.tileIndex ?? 0) + 1}`;
}
