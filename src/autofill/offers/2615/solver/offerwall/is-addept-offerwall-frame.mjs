// Bản giải riêng của offer 2615, chép từ src/autofill/offerwall/is-addept-offerwall-frame.mjs ngày 2026-11-17. Sửa ở đây không ảnh hưởng giải chung.
/**
 * Iframe offerwall Addept ("Take the Deal", https://sdk.scrptk.com/content/render), gắn ở trang cuối nhiều offer
 * (sweepstakesalerts.com, blissxo.com…). Frame này chỉ do bộ mở offerwall xử lý (mỗi offer một lần); các bộ trả lời
 * khảo sát/submit chung không được bấm nút offer trong đó (log 2026-11-16: một offer bị mở 5 lần).
 *
 * @param {object} frame Frame Playwright.
 * @return {boolean} True nếu là iframe render của Addept.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
export function isAddeptOfferwallFrame(frame) {
  try {
    const url = new URL(frame?.url?.() || '');
    return url.protocol === 'https:' && url.hostname === 'sdk.scrptk.com' && url.pathname === '/content/render';
  } catch { return false; }
}
