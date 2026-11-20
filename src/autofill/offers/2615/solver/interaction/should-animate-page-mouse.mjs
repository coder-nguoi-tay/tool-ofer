// Bản giải riêng của offer 2615, chép từ src/autofill/interaction/should-animate-page-mouse.mjs ngày 2026-11-17. Sửa ở đây không ảnh hưởng giải chung.
import { shouldStopAfterLead } from '../should-stop-after-lead.mjs';

/**
 * Cho phép mỗi tab mô phỏng chuột riêng, không phụ thuộc slot hoặc IP.
 * @param {object|null} page Tab đã được gắn slot của phiên autofill.
 * @return {boolean} Tab được phép chạy chuyển động chuột mô phỏng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export function shouldAnimatePageMouse(page) {
  if (page?._manualCaptchaPending || shouldStopAfterLead(page?._autofillSession)) return false;
  return page?._autofillMouseSlot === undefined || page._autofillMouseSlot >= 1;
}
