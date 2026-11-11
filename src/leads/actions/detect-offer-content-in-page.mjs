/**
 * Chạy trong trang (`frame.evaluate`): trang có ô nhập thật hoặc nhóm đáp án để chọn không.
 * Nút menu/cookie/chia sẻ, ô tìm kiếm, ô ở header/nav/footer (đăng ký bản tin) không tính —
 * trước đây chỉ cần có một nút hay iframe bất kỳ là tab quảng cáo/tin tức không bao giờ bị đóng.
 *
 * @return {{challenge: boolean, worked: boolean, hasForm: boolean, hasChoices: boolean}} Kết quả nhận diện.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function detectOfferContentInPage() {
  const shown = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const chrome = el => Boolean(el.closest('header, nav, footer, [role="navigation"], [role="banner"], [role="contentinfo"], #footer, .footer, .site-footer'));
  const noise = /close|skip ad|learn more|ad ?choices|privacy|cookie|accept|reject|agree|menu|share|tweet|facebook|sign in|log ?in|sign up|subscribe|search|next article|read more/i;
  const fieldSel = 'input:not([type]), input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input[type="date"], ' + 'input[type="radio"], input[type="checkbox"], select, textarea';
  const hasForm = [...document.querySelectorAll(fieldSel)].some(el => {
    if (!shown(el) || el.disabled || chrome(el)) return false;
    const hint = `${el.name || ''} ${el.id || ''} ${el.placeholder || ''} ${el.getAttribute('aria-label') || ''}`;
    return !/search|^\s*q\s*$|newsletter/i.test(hint);
  });
  // Đáp án survey dạng nút/thẻ: >= 2 lựa chọn chữ ngắn cùng một khối cha.
  const choiceSel = '[role="radio"], [role="option"], [role="checkbox"], button, label, a[class*="btn"], a[class*="answer"], a[class*="option"], ' + '[class*="answer"], [class*="option"], [class*="choice"]';
  const hasYesNo = [...document.querySelectorAll('button,label,a,[role="radio"],[role="button"],[onclick],.btn-option')].some(element =>
    shown(element) && !chrome(element) && /^(yes|no|có|không)$/i.test((element.innerText || element.getAttribute('aria-label') || '').trim())
  );
  const groups = new Map();
  for (const el of document.querySelectorAll(choiceSel)) {
    const text = String(el.innerText || '').trim();
    if (!text || text.length > 60 || noise.test(text) || !shown(el) || chrome(el)) continue;
    const parent = el.parentElement;
    groups.set(parent, (groups.get(parent) || 0) + 1);
  }
  return {
    challenge: /just a moment|checking your browser/i.test(document.title),
    // Mọi dấu autofill để lại khi đã thao tác trên trang (offerwall đã mở thẻ, nút MUI, SOI, đang gõ…).
    worked: Boolean(document.querySelector('[data-ux-filled], [data-ux-clicked], [data-ux-qclicked], [data-ux-semantic-clicked], [data-ux-submitted], ' + '[data-ux-opened], [data-ux-mui-clicked], [data-ux-soi-done], [data-ux-ow-clicked], [data-ux-autofill-owner], [data-ux-typing], ' + '[data-ux-semantic-answered], [data-ux-answer-attempt-at]')),
    hasForm,
    hasChoices: hasYesNo || [...groups.values()].some(n => n >= 2)
  };
}
