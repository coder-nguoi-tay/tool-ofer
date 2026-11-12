/**
 * Đọc dropdown khảo sát chưa chọn, loại trường dữ liệu cá nhân để giữ lựa chọn theo record.
 * @param {string|undefined} scopeSelector Phạm vi form/widget hiện tại.
 * @return {Array<object>} Select có placeholder và danh sách option hợp lệ; không đổi giá trị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function inspectSurveyDropdowns(scopeSelector) {
  const pending = [];
  const placeholder = option => !option || !String(option.value).trim() || /^(0|-1|none|placeholder|default|select)$/i.test(option.value) || /^(select|choose|chọn|vui lòng|pick|--|\.\.\.|please select)/i.test(option.text.trim());
  for (const [index, select] of Array.from(document.querySelectorAll('select')).entries()) {
    if (scopeSelector && !select.matches(scopeSelector) || select.disabled) continue;
    let hidden = false;
    for (let parent = select; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (parent.hidden || parent.hasAttribute('inert') || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') { hidden = true; break; }
    }
    if (hidden || !select.getClientRects().length || !placeholder(select.options[select.selectedIndex])) continue;
    const identity = [select.id, select.name, select.getAttribute('autocomplete'), ...Array.from(select.labels || []).map(label => label.textContent)].join(' ');
    if (/state|province|country|gender|title|salutation|birth|dob|email|phone|address|(?:^|[^a-z])(age|month|day|year|city|zip)(?:$|[^a-z])/i.test(identity)) continue;
    let marker = select.getAttribute('data-survey-dropdown-uid');
    if (!marker) { marker = `survey-select-${index}-${Date.now()}`; select.setAttribute('data-survey-dropdown-uid', marker); }
    pending.push({ uid: marker, id: select.id, name: select.name, options: Array.from(select.options).filter(option => !placeholder(option) && !option.disabled && !option.closest('optgroup[disabled]')).map(option => ({ value: option.value, text: option.text })) });
  }
  return pending;
}
