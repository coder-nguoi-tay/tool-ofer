/**
 * Đọc lỗi sau submit của đúng form, bỏ qua thông báo và trường của form khác.
 * @param {object|null} formScope Phạm vi biểu mẫu đã gửi.
 * @return {object} Kết quả validation và định danh trường bị từ chối.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function inspectSubmitErrors(formScope = null) {
  /**
   * Kiểm tra phần tử lỗi thuộc đúng form và vẫn hiển thị.
   * @param {Element} el Phần tử báo lỗi hoặc trường cần kiểm tra.
   * @return {boolean} Phần tử nằm trong phạm vi đang xử lý.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-10
   */
  const isVisible = el => {
    if (!el || formScope && !el.matches(formScope.memberSelector)) return false;
    const s = window.getComputedStyle ? window.getComputedStyle(el) : null;
    if (s && (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0')) return false;
    return Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  };
  const explicitErrorSelector = ['.error-message', '.invalid-feedback', '.form-error', '.field-error', '.validation-error', '.has-error .help-block', 'label.error', '.parsley-errors-list.filled', '[data-error]:not([data-error="false"])'].join(', ');
  const explicitErrors = Array.from(document.querySelectorAll(explicitErrorSelector)).filter(isVisible).map(element => (element.innerText || element.textContent || '').trim()).filter(text => text.length > 0 && !/^(ok|valid|success|accepted)$/i.test(text));
  const validationMessagePattern = /required|invalid|incorrect|error|failed|not valid|please (?:enter|provide|select|accept|check)|must be|is missing|cannot be blank|can't be blank|does not match|doesn't match/i;
  const alertErrors = Array.from(document.querySelectorAll('[role="alert"], [aria-live="assertive"], .alert-danger')).filter(isVisible).map(element => (element.innerText || element.textContent || '').trim()).filter(text => validationMessagePattern.test(text));
  const texts = Array.from(new Set([...explicitErrors, ...alertErrors]));
  const invalidInputs = Array.from(document.querySelectorAll('input:invalid, select:invalid, [aria-invalid="true"], input.error')).filter(el => isVisible(el) && el.type !== 'search' && !el.closest('form[role="search"], form:has(input[type="search"][name="q"])'));
  const firstInvalid = invalidInputs[0] || null;
  // Lỗi riêng của ô email (vd myresourcehelper: <p id="su-email-error">Email address invalid</p>) — các
  // selector chung ở trên không bắt được, nên email bị từ chối mà app không đổi email khác.
  const emailInput = Array.from(document.querySelectorAll('input[type="email"], input[name*="email" i], input[id*="email" i]')).find(isVisible);
  let emailError = null;
  if (emailInput && String(emailInput.value || '').includes('@')) {
    const scope = emailInput.closest('.form-group, .field-group, .gfield, .input-group') || emailInput.parentElement;
    const candidates = [...(scope ? Array.from(scope.querySelectorAll('*')) : []), ...Array.from(document.querySelectorAll('[id*="email" i][id*="error" i], [class*="email" i][class*="error" i]'))];
    emailError = candidates.filter(el => el !== emailInput && el.children.length === 0 && isVisible(el)).map(el => (el.innerText || el.textContent || '').trim()).find(t => /invalid|not valid|already|in use|exists|registered|blocked|incorrect|another|valid email|undeliverable|not allowed|not accepted/i.test(t)) || null;
  }
  if (emailError) {
    return {
      hasError: true,
      firstError: emailError,
      fieldTag: 'input',
      fieldId: emailInput.id || null,
      fieldName: emailInput.name || 'email',
      fieldClass: String(emailInput.className || ''),
      fieldContainerClass: emailInput.parentElement ? String(emailInput.parentElement.className || '') : null,
      fieldType: 'email',
      fieldValue: String(emailInput.value || ''),
      allErrors: [emailError, ...texts].slice(0, 5)
    };
  }
  return {
    hasError: texts.length > 0 || invalidInputs.length > 0,
    firstError: texts[0] || (firstInvalid ? firstInvalid.name || firstInvalid.id : null),
    // Định danh phần tử lỗi để nâng cấp matcher sau này
    fieldTag: firstInvalid ? firstInvalid.tagName.toLowerCase() : null,
    fieldId: firstInvalid ? firstInvalid.id || null : null,
    fieldName: firstInvalid ? firstInvalid.name || null : null,
    fieldClass: firstInvalid ? String(firstInvalid.className || '') : null,
    fieldContainerClass: firstInvalid && firstInvalid.parentElement ? String(firstInvalid.parentElement.className || '') : null,
    fieldType: firstInvalid ? firstInvalid.type || null : null,
    fieldValue: firstInvalid && 'value' in firstInvalid ? String(firstInvalid.value || '') : '',
    allErrors: texts.slice(0, 5)
  };
}
