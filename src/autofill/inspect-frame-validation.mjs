/**
 * Đọc hasUnfilledRequiredOrErrorField từ DOM trong frame; hàm được Playwright thực thi trực tiếp trong trang.
 * @param {object|null} formScope Phạm vi form/container cần kiểm tra.
 * @return {*} Kết quả kiểm tra DOM.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function inspectFrameValidation(formScope = null) {
  /**
   * Chỉ xét control hiển thị thuộc form hoặc khảo sát đang xử lý.
   * @param {Element} el Phần tử cần kiểm tra.
   * @return {boolean} Phần tử hợp lệ trong phạm vi hiện tại.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-10
   */
  const isVisible = el => {
    if (!el || el.disabled || formScope && !el.matches(formScope.memberSelector)) return false;
    if (formScope?.nativeForm && el.form && el.form !== document.querySelector(formScope.rootSelector)) return false;
    if (el.closest('header, footer, nav')) return false;
    // Loại trừ trường nằm trong step ẩn, tab ẩn, carousel ẩn hoặc aria-hidden
    if (el.closest('[aria-hidden="true"], [inert], .inactive, .hidden, .hide, .step:not(.active):not(.current):not(.is-active):not([class*="active"]), .tab-pane:not(.active):not(.is-active), .carousel-item:not(.active)')) return false;
    const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
    if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    return true;
  };
  const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea'));
  for (const input of inputs) {
    if (!isVisible(input)) continue;
    if (input.type === 'search' || input.closest('form[role="search"], form:has(input[type="search"][name="q"])')) continue;
    const val = (input.value || '').trim();
    let isChecked = true;
    if (input.type === 'checkbox') {
      isChecked = input.checked;
    } else if (input.type === 'radio') {
      // Đối với nhóm radio buttons: Nếu CÙNG NAME có bất kỳ radio nào đã được tích, thì nhóm đó đã hợp lệ!
      const radioName = input.name;
      if (radioName) {
        const group = Array.from(document.querySelectorAll('input[type="radio"]')).filter(radio => radio.name === radioName && radio.form === input.form && (!formScope || radio.matches(formScope.memberSelector)));
        isChecked = group.some(r => r.checked);
      } else {
        isChecked = input.checked;
      }
    }

    // Bỏ qua các trường tùy chọn không bắt buộc (apt, suite, unit, address2, secondary, optional, middle_name, notes, comments)
    const fieldMeta = `${input.name || ''} ${input.id || ''} ${input.className || ''}`.toLowerCase();
    const isExplicitOptional = /apt|suite|unit|address2|street2|secondary|middle|comments|notes|ext\b|optional/i.test(fieldMeta);
    if (isExplicitOptional) continue;
    const isRequiredAttr = input.required || input.getAttribute('aria-required') === 'true';
    const hasErrorClass = input.classList.contains('error') || input.classList.contains('invalid') || input.getAttribute('aria-invalid') === 'true';

    // Chỉ coi là lỗi thực sự nếu phần tử thông báo lỗi ĐANG HIỂN THỊ và CÓ CHỮ THỰC TẾ
    const parentGroup = input.closest('.input-group, .form-group, .field, .loco-group, .checkbox-group, .checkbox, label, div');
    const hasParentError = parentGroup ? Array.from(parentGroup.querySelectorAll('.error:not(input):not(select), .error-message, .invalid-feedback, .error-text, [role="alert"]')).some(errEl => {
      if (!isVisible(errEl)) return false;
      const errText = (errEl.innerText || errEl.textContent || '').trim();
      return errText.length > 0;
    }) : false;

    // Checkbox: nếu đã checked thì hợp lệ; nếu chưa checked, chỉ bỏ qua nếu chắc chắn không phải consent/required/error
    if (input.type === 'checkbox') {
      if (isChecked) continue;
      const label = input.closest('label') || (input.id ? document.querySelector(`label[for="${input.id}"]`) : null);
      const textNear = ((label ? label.innerText || label.textContent || '' : '') + ' ' + (parentGroup ? parentGroup.innerText || parentGroup.textContent || '' : '')).toLowerCase();
      const isConsent = isRequiredAttr || hasParentError || hasErrorClass || /accept|agree|consent|terms|tcpa|privacy|policy|disclosure|must\s*(?:accept|agree|check|confirm|be)|you\s*must|required|mandatory|i\s*represent|18\+|certify|acknowledge|authorize|understand|by\s*checking|by\s*clicking|continue|proceed/i.test(textNear) || /consent|terms|agree|privacy|policy|disclosure|tcpa|optin|tos|rules|accept|confirm|legal|disclaimer|certify|authorize|resident|must/i.test(fieldMeta);
      if (!isConsent) {
        continue;
      }
    }
    let labelIsRequired = false;
    if (input.id) {
      const lbl = document.querySelector(`label[for="${input.id}"]`);
      if (lbl && /(^|\s)\*|\*(\s|$)/.test(lbl.innerText || lbl.textContent || '')) labelIsRequired = true;
    }
    if (!labelIsRequired && parentGroup && parentGroup.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select').length === 1) {
      const lbl = parentGroup.querySelector('label');
      if (lbl && /(^|\s)\*|\*(\s|$)/.test(lbl.innerText || lbl.textContent || '')) labelIsRequired = true;
    }
    const isEmailField = input.type === 'email' || /email/i.test(input.name || '') || /email/i.test(input.id || '');
    const isInvalidEmailVal = isEmailField && (!val || !val.includes('@'));
    const hasValidationIssue = Boolean(hasErrorClass || hasParentError || input.validity && !input.validity.valid);
    if (isEmailField && isInvalidEmailVal) {
      return {
        unfilled: true,
        id: input.id || input.name || 'email',
        type: input.type || 'email',
        reason: 'missing_or_invalid_email',
        className: String(input.className || ''),
        containerClass: input.parentElement ? String(input.parentElement.className || '') : null
      };
    }
    if ((isRequiredAttr || labelIsRequired) && (!val || !isChecked)) {
      return {
        unfilled: true,
        id: input.id || input.name || 'unknown',
        type: input.type || input.tagName.toLowerCase(),
        reason: 'missing_required',
        className: String(input.className || ''),
        containerClass: input.parentElement ? String(input.parentElement.className || '') : null
      };
    }
    if (hasValidationIssue) {
      return {
        unfilled: true,
        id: input.id || input.name || 'unknown',
        type: input.type || input.tagName.toLowerCase(),
        reason: 'validation_error',
        className: String(input.className || ''),
        containerClass: input.parentElement ? String(input.parentElement.className || '') : null
      };
    }
  }
  return {
    unfilled: false
  };
}
