import { protectConfirmedLeadSession } from '../../leads/actions/protect-confirmed-lead-session.mjs';

// Hết giờ đúng lúc đang chờ lead 2×30s thì đợi lượt kiểm tra xong (tối đa vài chục giây) rồi mới quyết định.
const LEAD_CHECK_RECHECK_MS = 5000;

/**
 * Ô "Chờ tối đa": phiên chạy quá N phút kể từ lúc mở xong thì tự tắt trình duyệt và bù slot mới, kể cả offer làm đến
 * cuối không chờ lead. Không tắt phiên đã có lead (app giữ cứng phiên có lead, chỉ người dùng tự đóng).
 * @param {object} session Phiên đang chạy (browser, isClosed, leadCheckRunning, addBrowserLog).
 * @param {number} minutes Số phút tối đa; 0 hoặc không hợp lệ là không giới hạn.
 * @param {Function} [closeBrowser] Cách đóng phiên; mặc định đóng context như khi hết lead để engine tự dọn và bù slot.
 * @return {Function} Huỷ hẹn giờ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export function attachMaxRunTimer(session, minutes, closeBrowser = () => session.browser?.close?.()) {
  const limitMs = Number(minutes) * 60_000;
  if (!(limitMs > 0)) return () => {};
  let timer;
  const check = async () => {
    if (session.isClosed || session.browser?.isClosed?.()) return;
    if (protectConfirmedLeadSession(session)) return;
    if (session.leadCheckRunning) {
      timer = setTimeout(check, LEAD_CHECK_RECHECK_MS);
      timer.unref?.();
      return;
    }
    session.addBrowserLog?.({ type: 'max_run_timeout', detail: `Phiên đã chạy quá ${minutes} phút (ô Chờ tối đa); tự tắt trình duyệt và bù slot mới.` });
    // Cùng cờ với lúc đóng vì không có lead: app chủ động đóng để bù slot, không tính là người dùng tự đóng.
    session.closingDueToNoLead = true;
    session.suppressAutoRefill = false;
    await Promise.resolve(closeBrowser()).catch(() => {});
  };
  timer = setTimeout(check, limitMs);
  timer.unref?.();
  return () => clearTimeout(timer);
}
