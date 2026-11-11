/**
 * Trích đặc điểm cho các option trong cùng block. Dùng với
 * `frame.locator('[data-ux-option-uid]').evaluateAll(extractOptionFeaturesInPage, nearQuestion)`,
 * nên chỉ được dùng biến cục bộ và DOM API.
 *
 * @param {Element[]} els Các phần tử option đã gắn `data-ux-option-uid`.
 * @param {boolean} nearQuestion Câu hỏi nằm ngay trong block hay không.
 * @return {Array<{uid: string, label: string, features: object}>} Candidate theo thứ tự của `els`.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function extractOptionFeaturesInPage(els, nearQuestion) {
  const NOISE_RE = /privacy|terms|policy|disclaimer|cookie|unsubscribe|sign in|log ?in|my account|contact us|about us/i;
  const text = el => String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const labels = els.map(text);
  return els.map((el, i) => {
    const input = el.matches('input') ? el : el.querySelector('input[type="radio"], input[type="checkbox"]');
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    const role = el.getAttribute('role') || (input ? input.type : el.tagName === 'BUTTON' ? 'button' : el.tagName === 'A' ? 'link' : '');
    const features = {
      visible: r.width > 4 && r.height > 4 && s.display !== 'none' && s.visibility !== 'hidden',
      enabled: !el.disabled && !(input && input.disabled) && el.getAttribute('aria-disabled') !== 'true',
      hidden: Boolean(el.closest('[aria-hidden="true"], [inert]')),
      sameBlock: true,
      nearQuestion,
      role,
      hasLabel: Boolean(labels[i] || el.getAttribute('aria-label')),
      noise: NOISE_RE.test(labels[i]) || Boolean(el.closest('header, nav, footer, .site-footer, #footer')),
      selected: Boolean(input && input.checked || el.matches('.selected, .active, [aria-selected="true"], [aria-pressed="true"], [aria-checked="true"]')),
      duplicate: labels.indexOf(labels[i]) !== i
    };
    return {
      uid: el.getAttribute('data-ux-option-uid'),
      label: labels[i].slice(0, 90),
      features
    };
  });
}
export { extractOptionFeaturesInPage };
