import { autoRefill } from '../../runtime/constants/auto-refill.mjs';
import { saveAutoRefillSettings } from '../../refill/actions/save-auto-refill-settings.mjs';

/**
 * Chốt chính sách bù khi người dùng đóng một browser: luồng không check lead giữ mục tiêu.
 * Luồng check lead giữ hành vi đóng chủ động không bù; Dừng/Đóng tất cả luôn được ưu tiên.
 * @param {object} session Phiên được đóng bằng nút X trên cửa sổ hoặc trong app.
 * @return {boolean} True khi luồng không check lead được phép bù lại slot.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function prepareManualBrowserClose(session) {
  if (session._manualBrowserClosePrepared) return !session.suppressAutoRefill && autoRefill.enabled && !autoRefill.stopRequested;
  session._manualBrowserClosePrepared = true;
  const refill = session.enableLeadCheck === false && autoRefill.enabled && !autoRefill.stopRequested && !session.suppressAutoRefill;
  session.suppressAutoRefill = !refill;
  if (!refill && autoRefill.enabled && !autoRefill.stopRequested && autoRefill.targetCount > 0) {
    autoRefill.targetCount -= 1;
    void saveAutoRefillSettings();
  }
  session.addBrowserLog?.({
    type: refill ? 'manual_browser_closed_refill' : 'manual_browser_closed',
    detail: refill ? 'Đóng một trình duyệt của luồng không check lead; giữ mục tiêu và tự bù slot.' : 'Đóng chủ động; không tự bù lại slot này.'
  });
  return refill;
}
