/**
 * Đọc trạng thái validation thực của form, bỏ qua nội dung cảnh báo và hướng dẫn chung.
 *
 * @param {object} page Trang Playwright cần kiểm tra.
 * @return {Promise<{errors:string[],emailInput:object|null,emailMissing:boolean,problemInputs:object[],hasBlocker:boolean}|null>} Trạng thái lỗi form đang hiển thị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
async function inspectFormRepairState(page) {
  const targetFrame = page._activeAutofillFrame || page;
  const evaluation = targetFrame.evaluate(formScope => {
    const isVisible = element => {
      if (!element || formScope && !element.matches(formScope.memberSelector)) return false;
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (parent.hidden || parent.hasAttribute('inert') || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      }
      if (element.tagName === 'INPUT' && (element.type === 'checkbox' || element.type === 'radio')) {
        const parent = element.closest('label, div, li, .form-check, .checkbox') || element;
        const style = window.getComputedStyle ? window.getComputedStyle(parent) : null;
        if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
        return Boolean(parent.offsetWidth || parent.offsetHeight || parent.getClientRects().length);
      }
      const style = window.getComputedStyle ? window.getComputedStyle(element) : null;
      if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return false;
      return Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
    };
    const looksLikeValidationMessage = text => /required|invalid|incorrect|error|failed|not valid|please (?:enter|provide|select|accept|check)|must be|is missing|cannot be blank|can't be blank|does not match|doesn't match/i.test(text);
    const explicitErrorSelector = ['.error-message', '.invalid-feedback', '.form-error', '.field-error', '.validation-error', '.help-block.error', '.has-error .help-block', '.msg-error', 'label.error', '.parsley-errors-list.filled', '[data-error]:not([data-error="false"])'].join(', ');
    const explicitErrors = Array.from(document.querySelectorAll(explicitErrorSelector)).filter(isVisible).map(element => (element.innerText || element.textContent || '').trim()).filter(text => text.length > 0 && !/^(ok|valid|success|accepted)$/i.test(text));
    const alertErrors = Array.from(document.querySelectorAll('[role="alert"], [aria-live="assertive"], .alert-danger')).filter(isVisible).map(element => (element.innerText || element.textContent || '').trim()).filter(text => looksLikeValidationMessage(text));
    const errors = Array.from(new Set([...explicitErrors, ...alertErrors]));
    const inputs = Array.from(document.querySelectorAll(['input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"])', 'select', 'textarea', '[role="checkbox"]', '[role="radio"]', '[role="combobox"]', '[contenteditable="true"]', '.btn-option', 'div.btn-option'].join(', '))).filter(isVisible);
    let emailInput = null;
    const problemInputs = [];
    for (const element of inputs) {
      if (element.type === 'search' || element.closest?.('form[role="search"], form:has(input[type="search"][name="q"])')) continue;
      const tag = element.tagName.toLowerCase();
      const type = (element.type || element.getAttribute('role') || tag).toLowerCase();
      const id = element.id || '';
      const name = element.name || '';
      const placeholder = element.placeholder || '';
      const value = (element.value || element.innerText || '').trim();
      const isEmail = type === 'email' || /email|mail/i.test(`${name} ${id} ${placeholder}`);
      const isPlaceholderMask = /^(\+1|\+1\s*|\(___\)\s*___-____|___-__-____|[_\-()\s.\/]+|mm\/dd\/yyyy)$/i.test(value);
      const isEmpty = value === '' || isPlaceholderMask;
      const isInvalid = element.getAttribute('aria-invalid') === 'true' || element.classList.contains('error') || Boolean(element.validity && !element.validity.valid);
      const isCheckbox = type === 'checkbox' || type === 'radio' || element.getAttribute('role') === 'checkbox';
      const isChecked = isCheckbox ? Boolean(element.checked || element.getAttribute('aria-checked') === 'true' || element.classList.contains('checked')) : true;
      const isRequired = Boolean(element.required || element.getAttribute('aria-required') === 'true');
      const selector = id ? `[id=${JSON.stringify(id)}]` : name ? `${tag}[name=${JSON.stringify(name)}]` : tag;
      if (isEmail && !emailInput) {
        emailInput = {
          id,
          name,
          type,
          val: value,
          isEmpty,
          isInvalid,
          required: isRequired,
          selector
        };
      }
      if (isEmpty || isInvalid || isCheckbox && !isChecked) {
        problemInputs.push({
          tag,
          type,
          id,
          name,
          placeholder,
          currentValue: value,
          isEmpty,
          isInvalid,
          required: isRequired,
          selector
        });
      }
    }
    const emailMissing = Boolean(emailInput && (emailInput.isEmpty || !emailInput.val.includes('@') || emailInput.isInvalid));
    const hasRequiredProblem = problemInputs.some(input => input.required || input.isInvalid);
    return {
      errors,
      emailInput,
      emailMissing,
      problemInputs: problemInputs.slice(0, 15),
      hasBlocker: errors.length > 0 || emailMissing || hasRequiredProblem
    };
  }, targetFrame._activeAutofillFormScope || null).catch(() => null);
  let timer;
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => resolve(null), 4000);
    timer.unref?.();
  });
  return Promise.race([evaluation, timeout]).finally(() => clearTimeout(timer));
}
export { inspectFormRepairState };
