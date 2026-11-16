import { protectConfirmedLeadSession } from '../../leads/actions/protect-confirmed-lead-session.mjs';
import { shouldStopAfterLead } from '../../autofill/should-stop-after-lead.mjs';
import { isOffer2615 } from '../../autofill/offers/2615/match-offer.mjs';

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
    // Người dùng chốt 2026-11-16: phiên có lead cũng giới hạn theo ô Chờ tối đa để nhường slot (lead đã ghi trên toffers).
    // Chỉ giữ khi bật "dừng autofill khi có lead" — chế độ đó cố ý giữ trình duyệt cho người thao tác tay.
    if (shouldStopAfterLead(session)) return;
    if (session.leadCheckRunning) {
      timer = setTimeout(check, LEAD_CHECK_RECHECK_MS);
      timer.unref?.();
      return;
    }
    const hasLead = protectConfirmedLeadSession(session);
    if (hasLead && isOffer2615(null, session)) {
      // Luồng Offer 2615 khi đã có lead: không tự tắt theo timer timeout, tiếp tục giữ và F5 để làm hết tới thankyou
      timer = setTimeout(check, LEAD_CHECK_RECHECK_MS * 2);
      timer.unref?.();
      return;
    }
    session.addBrowserLog?.({ type: 'max_run_timeout', detail: `Phiên${hasLead ? ' (IP đã có lead)' : ''} đã chạy quá ${minutes} phút (ô Chờ tối đa); tự tắt trình duyệt và bù slot mới.` });
    // Cùng cờ với lúc đóng vì không có lead: app chủ động đóng để bù slot, không tính là người dùng tự đóng.
    session.closingDueToNoLead = true;
    session.suppressAutoRefill = false;
    // Phiên có lead: protectConfirmedLeadSession() ở các bộ canh khác xoá closingDueToNoLead, khi đó mất CDP sẽ bị hiểu
    // là sự cố và nối lại / mở tab mới giữ lead. Đánh dấu đã đóng trước (như hoàn tất thankyou.php) để đóng hẳn.
    if (hasLead) session.isClosed = true;
    await Promise.resolve(closeBrowser()).catch(() => {});
  };
  timer = setTimeout(check, limitMs);
  timer.unref?.();
  return () => clearTimeout(timer);
}
