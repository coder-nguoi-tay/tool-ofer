/**
 * Phân biệt thao tác trả lời với submit/đi tới và consent ngay trên control thật.
 * @param {Element} element Target của action AI.
 * @return {object} Quyền nghiệp vụ dùng để chặn submit ngoài pipeline autofill.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function inspectActionPurpose(element) {
  const text = [element.innerText,element.value,element.getAttribute('aria-label'),element.title].filter(Boolean).join(' ').trim();
  const input = element.matches('input') ? element : element.querySelector('input');
  const label = input?.closest('label') || input?.labels?.[0];
  return {
    submit: element.matches('button[type="submit"],input[type="submit"],.cta-button,.rjp-cta-button,.sjp-cta-button,a[href*="/next"]') || element.tagName === 'BUTTON' && element.form && !element.hasAttribute('type') || /^(continue|next|submit|claim|confirm|finish|done|proceed|start\b|register\b|join\b|apply\b|request\b|get\b|unlock\b|tiếp tục|gửi)/i.test(text),
    noise: /^(what will i earn|learn more|help|faq|privacy|terms|policy)\b/i.test(text),
    semanticOwned: element.getAttribute('data-ux-semantic-owned') === '1',
    consent: input?.type === 'checkbox' && (input.required || /consent|terms|privacy|agree|tcpa|disclosure|policy/i.test([input.name,input.id,label?.textContent].join(' '))),
  };
}
