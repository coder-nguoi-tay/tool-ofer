/**
 * Chạy trong trang (`frame.evaluate`): trang có ô nhập thật hoặc nhóm đáp án để chọn không.
 * Nút menu/cookie/chia sẻ, ô tìm kiếm, ô ở header/nav/footer (đăng ký bản tin) không tính —
 * trước đây chỉ cần có một nút hay iframe bất kỳ là tab quảng cáo/tin tức không bao giờ bị đóng.
 *
 * @return {{loading: boolean, challenge: boolean, worked: boolean, hasForm: boolean, hasChoices: boolean, empty: boolean, singleLine: boolean}} Kết quả nhận diện offer và trang rỗng/tối giản.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function detectOfferContentInPage() {
  const shown = element => {
    for (let parent = element; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (parent.hidden || parent.hasAttribute('inert') || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    }
    return element.getClientRects().length > 0;
  };
  const chrome = element => {
    const consumed = element.closest('[data-ux-offer-action-label]');
    return Boolean(element.closest('header, nav, footer, [role="navigation"], [role="banner"], [role="contentinfo"], #footer, .footer, .site-footer')) || Boolean(consumed && (consumed.innerText || consumed.value || '').replace(/\s+/g, ' ').trim() === consumed.getAttribute('data-ux-offer-action-label'));
  };
  const noise = /close|skip ad|learn more|ad ?choices|privacy|cookie|accept|reject|agree|menu|share|tweet|facebook|sign in|log ?in|sign up|subscribe|search|next article|read more/i;
  const fieldSel = 'input:not([type]), input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input[type="date"], ' + 'input[type="radio"], input[type="checkbox"], select, textarea';
  const hasForm = [...document.querySelectorAll(fieldSel)].some(el => {
    if ((!shown(el) && !Array.from(el.labels || []).some(shown)) || chrome(el)) return false;
    const hint = `${el.name || ''} ${el.id || ''} ${el.placeholder || ''} ${el.getAttribute('aria-label') || ''}`;
    return !/search|^\s*q\s*$|newsletter/i.test(hint);
  });
  // Đáp án survey dạng nút/thẻ: >= 2 lựa chọn chữ ngắn cùng một khối cha.
  const choiceSel = '[role="radio"], [role="option"], [role="checkbox"], button, label, a[class*="btn"], a[class*="answer"], a[class*="option"], ' + '[class*="answer"], [class*="option"], [class*="choice"]';
  const hasYesNo = [...document.querySelectorAll('button,label,a,[role="radio"],[role="button"],[onclick],.btn-option')].some(element =>
    shown(element) && !chrome(element) && /^(yes|no|có|không)$/i.test((element.innerText || element.getAttribute('aria-label') || '').trim())
  );
  const hasContinue = [...document.querySelectorAll('button,a,[role="button"],input[type="submit"]')].some(element =>
    shown(element) && !chrome(element) && /^(continue|next|next step|submit|start survey|take survey|tiếp tục|tiếp theo|gửi)\s*[→›»!]*$/i.test((element.innerText || element.value || '').trim())
  );
  const groups = new Map();
  for (const el of document.querySelectorAll(choiceSel)) {
    const text = String(el.innerText || '').trim();
    if (!text || text.length > 60 || noise.test(text) || !shown(el) || chrome(el)) continue;
    const parent = el.parentElement;
    groups.set(parent, (groups.get(parent) || 0) + 1);
  }
  const loading = document.readyState !== 'complete' || [...document.querySelectorAll('[aria-busy="true"],.spinner,.loading')].some(shown);
  const challenge = /just a moment|checking your browser/i.test(document.title);
  const worked = Boolean(document.querySelector('[data-ux-filled], [data-ux-clicked], [data-ux-qclicked], [data-ux-semantic-clicked], [data-ux-submitted], ' + '[data-ux-opened], [data-ux-mui-clicked], [data-ux-soi-done], [data-ux-ow-clicked], [data-ux-autofill-owner], [data-ux-typing], ' + '[data-ux-semantic-answered], [data-ux-answer-attempt-at]'));
  const hasChoices = hasYesNo || hasContinue || [...groups.values()].some(n => n >= 2);
  const visibleText = (document.body?.innerText || document.body?.textContent || '').trim();
  const hasVisibleMedia = [...document.querySelectorAll('img, canvas, video, picture, svg')].some(shown);
  const hasVisibleLink = [...document.querySelectorAll('a[href]')].some(shown);
  const noOfferContent = !loading && !challenge && !worked && !hasForm && !hasChoices && !hasVisibleMedia && !hasVisibleLink;
  return {
    loading,
    challenge,
    worked,
    hasForm,
    hasChoices,
    empty: noOfferContent && !visibleText,
    singleLine: noOfferContent && visibleText.length > 0 && visibleText.length <= 300 && visibleText.split(/\r?\n/).filter(line => line.trim()).length <= 1
  };
}
