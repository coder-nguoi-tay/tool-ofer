/**
 * Theo dõi lỗi của các control đang hiện trong đúng một lần gửi. Chạy trong frame sở hữu form.
 * @param {object} formScope Phạm vi form đã xác định cho lần gửi này.
 * @return {object|null} Kết quả trước khi gửi, bộ đọc phản hồi sau khi gửi và hàm dọn listener.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export function observeFormValidation(formScope) {
  const root = document.querySelector(formScope.rootSelector);
  if (!root || formScope.active === false || formScope.unavailable) return null;
  const controls = formScope.nativeForm
    ? new Set([...root.elements, ...root.querySelectorAll('[role="combobox"]')])
    : root.querySelectorAll('input, select, textarea, [role="combobox"]');
  const skipNativeValidation = formScope.skipNativeValidation || root.hasAttribute('novalidate');
  const initialErrors = [];
  const submittedControls = new Set();
  const rejectedFields = new Map();

  /**
   * Xác định tên trường cần báo cho người dùng mà không sao chép giá trị nhập.
   * @param {Element} control Control phát sinh lỗi.
   * @param {string} reason Loại lỗi validation.
   * @return {{label: string, reason: string}} Nhãn và lý do chẩn đoán.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-19
   */
  function describeField(control, reason) {
    const referencedLabels = (control.getAttribute('aria-labelledby') || '').split(/\s+/)
      .map(id => control.ownerDocument.getElementById(id)?.textContent.trim()).filter(Boolean);
    const labels = Array.from(control.labels || [], label => {
      const copy = label.cloneNode(true);
      for (const nested of copy.querySelectorAll('input, select, textarea')) nested.remove();
      return copy.textContent.trim();
    });
    const label = referencedLabels.join(' ') || control.getAttribute('aria-label') || labels.join(' ') ||
      control.name || control.id || control.localName;
    return { label: label.replace(/\s+/g, ' ').trim().slice(0, 100), reason };
  }

  /**
   * Nhận diện thông báo lỗi đang hiện và được chính control tham chiếu.
   * @param {Element} control Trường có hướng dẫn hoặc thông báo liên kết.
   * @return {boolean} Có phần tử thông báo mang trạng thái lỗi rõ ràng.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-19
   */
  function hasLinkedError(control) {
    const references = [control.getAttribute('aria-errormessage'), control.getAttribute('aria-describedby')];
    for (const id of references.filter(Boolean).join(' ').split(/\s+/).filter(Boolean)) {
      const message = control.ownerDocument.getElementById(id);
      if (!message?.matches('.invalid-feedback, .error-message, .field-error, .validation-error, .error') ||
          message.closest('[hidden], [aria-hidden="true"]') || !message.getClientRects().length) continue;
      if (getComputedStyle(message).visibility === 'visible' && message.textContent.trim()) return true;
    }
    return false;
  }

  for (const control of controls) {
    if (!control.matches('input, select, textarea, [role="combobox"]') ||
        control.matches(':disabled, [readonly], input[type="hidden"]') ||
        control.closest('[hidden], [inert], [aria-hidden="true"], [aria-disabled="true"]')) continue;
    if (formScope.nativeForm && control.form && control.form !== root) continue;
    if (!control.getClientRects().length || getComputedStyle(control).visibility !== 'visible') continue;

    const validity = control.validity;
    let reason = '';
    if (control.getAttribute('aria-invalid') === 'true') reason = 'aria-invalid';
    else if (!skipNativeValidation && control.willValidate && validity?.valid === false) {
      reason = ['valueMissing', 'typeMismatch', 'patternMismatch', 'tooShort', 'tooLong',
        'rangeUnderflow', 'rangeOverflow', 'stepMismatch', 'badInput', 'customError'].find(flag => validity[flag]) || 'invalid';
    } else if (control.localName === 'select' && (control.getAttribute('aria-required') === 'true' ||
        (!skipNativeValidation && control.hasAttribute('required')))) {
      // Một số engine chỉ cập nhật selectedIndex mà chưa cập nhật ValidityState.
      const first = control.options[0];
      const placeholderSelected = !control.hasAttribute('multiple') && !(Number(control.getAttribute('size')) > 1) && control.selectedIndex === 0 &&
        first?.parentElement === control && first.value === '';
      if (control.selectedIndex < 0 || placeholderSelected) reason = 'valueMissing';
    }
    if (!reason && control.localName === 'select' && !control.hasAttribute('multiple') && formScope.verifiedSelections?.length) {
      const expected = formScope.verifiedSelections.filter(selection => selection.id
        ? selection.id === control.id : selection.name && selection.name === control.name);
      if (expected.length === 1 && control.value !== expected[0].value) reason = 'selectionChanged';
    }
    if (!reason && hasLinkedError(control)) reason = 'linkedError';
    submittedControls.add(control);
    if (reason) initialErrors.push(describeField(control, reason));
  }
  // Bắt invalid ở pha capture để nhận cả sự kiện từ control liên kết ngoài form.
  const onInvalid = event => {
    if (!submittedControls.has(event.target)) return;
    rejectedFields.set(event.target, describeField(event.target, 'invalid'));
  };
  const observer = new MutationObserver(changes => {
    for (const { target } of changes) {
      if (target.getAttribute('aria-invalid') === 'true') {
        rejectedFields.set(target, describeField(target, 'aria-invalid'));
      }
    }
  });
  if (!initialErrors.length && submittedControls.size) {
    document.addEventListener('invalid', onInvalid, true);
    for (const control of submittedControls) observer.observe(control, { attributeFilter: ['aria-invalid'] });
  }
  return {
    initialErrors,
    watching: submittedControls.size > 0,
    /**
     * Đọc những lỗi trang đã báo trên các control của bước vừa gửi.
     * @return {object[]} Các trường trang đã đánh dấu sai trong cửa sổ quan sát.
     * @author ductv <ductv@getflycrm.com>
     * @since 2026-11-19
     */
    readFeedback() {
      for (const control of submittedControls) {
        if (control.isConnected && !rejectedFields.has(control) && hasLinkedError(control)) {
          rejectedFields.set(control, describeField(control, 'linkedError'));
        }
      }
      return Array.from(rejectedFields.values());
    },
    /**
     * Tháo bộ theo dõi khi thao tác kết thúc hoặc bị hủy.
     * @return {void}
     * @author ductv <ductv@getflycrm.com>
     * @since 2026-11-19
     */
    close() {
      document.removeEventListener('invalid', onInvalid, true);
      observer.disconnect();
    }
  };
}
