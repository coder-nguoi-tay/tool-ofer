/**
 * Thu control và câu hỏi thực sự hiển thị trong phạm vi hiện tại, bỏ phần tử của các bước ẩn.
 * @param {object} context Phạm vi form và tiền tố marker cho control không có id duy nhất.
 * @return {object} Trạng thái tương tác đang hiển thị của document, không chứa HTML thô.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function inspectVisibleInteractions({ formScope, markerPrefix }) {
  /**
   * Kiểm tra toàn bộ chuỗi cha để không nhận nút bị ẩn hoặc đang bị khóa bởi widget.
   * @param {Element} element Control hoặc vùng câu hỏi cần kiểm tra.
   * @return {boolean} Phần tử có giao diện hiển thị trong phạm vi đã chọn.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-11
   */
  const visible = element => {
    if (!element || formScope && !element.matches(formScope.memberSelector)) return false;
    for (let parent = element; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (parent.hidden || parent.hasAttribute('inert') || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return false;
    }
    const bounds = element.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0;
  };
  /**
   * Chuẩn hóa nhãn để chữ ký không đổi vì khoảng trắng hoặc xuống dòng.
   * @param {*} text Nội dung từ DOM.
   * @return {string} Nội dung ngắn gọn để AI đọc và so sánh tiến triển.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-11
   */
  const normalize = text => String(text || '').replace(/\s+/g, ' ').trim();
  const controls = [];
  const elements = document.querySelectorAll('input:not([type="hidden"]), textarea, select, button, [role="button"], [role="checkbox"], [role="radio"], [contenteditable="true"], a.btn, a.button, a[href*="/next"], .btn-option, .twy-buttonnext, .cta-button, .rjp-cta-button, .sjp-cta-button, div.button, div.btn, .choice-btn, .option-btn, .quiz-btn, .answer-btn, a.choice, .choices a, .answers a, .creative-survey-answer, .choice-card, .option-card, [data-vector-answer="true"]');
  for (const element of elements) {
    const checkable = element.matches('input[type="checkbox"], input[type="radio"]');
    const label = element.closest('label') || (element.id ? Array.from(document.querySelectorAll('label[for]')).find(item => item.htmlFor === element.id) : null);
    if (!visible(element) && !(checkable && visible(label))) continue;
    if (formScope?.nativeForm && element.form && element.form !== document.querySelector(formScope.rootSelector)) continue;
    const group = element.closest('.twy-customquestion, .question, .survey-question, fieldset, [role="group"], [role="radiogroup"], .checkbox-group') || element.parentElement;
    const labelText = normalize(label?.innerText || element.getAttribute('aria-label') || element.placeholder || element.innerText).slice(0, 240);
    const type = element.type || element.getAttribute('role') || element.tagName.toLowerCase();
    const disabled = element.matches(':disabled') || Boolean(element.closest('[aria-disabled="true"], [aria-busy="true"]'));
    let marker = element.getAttribute('data-ux-ai-target');
    if (!marker) { marker = markerPrefix + '-' + controls.length; element.setAttribute('data-ux-ai-target', marker); }
    const value = element.isContentEditable ? element.innerText : element.value || '';
    const checked = Boolean(element.checked) || element.getAttribute('aria-checked') === 'true' || element.getAttribute('aria-pressed') === 'true';
    controls.push({
      selector: '[data-ux-ai-target="' + marker + '"]', id: element.id, name: element.getAttribute('name') || '',
      tag: element.tagName.toLowerCase(), type, label: labelText, value, checked, disabled, readOnly: Boolean(element.readOnly),
      required: Boolean(element.required) || element.getAttribute('aria-required') === 'true',
      invalid: element.matches(':invalid, [aria-invalid="true"], .invalid, .error'),
      selected: checked || element.getAttribute('data-ux-qclicked') === '1' || element.getAttribute('data-ux-mui-clicked') === '1' || element.getAttribute('aria-selected') === 'true' || element.getAttribute('data-ux-clicked') === '1' || element.classList.contains('selected'),
      group: (group?.id || normalize(group?.querySelector('legend, .question-title, .twy-cqlabel')?.textContent).slice(0, 140) || element.name || '') + ':' + (element.form?.id || ''),
      options: element.tagName === 'SELECT' ? Array.from(element.options).slice(0, 60).map(option => ({ value: option.value, text: normalize(option.textContent), disabled: option.disabled })) : undefined,
    });
    if (controls.length >= 160) break;
  }
  const questions = Array.from(document.querySelectorAll('h1, h2, h3, legend, .question-title, .twy-cqlabel, #questionText')).filter(visible).map(element => normalize(element.innerText)).filter(Boolean).slice(0, 24);
  const errors = Array.from(document.querySelectorAll('.error-message, .form-error, .invalid-feedback, .validation-error, [role="alert"]')).filter(visible).map(element => normalize(element.innerText)).filter(Boolean).slice(0, 20);
  return { url: location.href, controls, questions, errors };
}
