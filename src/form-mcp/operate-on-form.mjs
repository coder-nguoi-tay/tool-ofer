/**
 * Đọc trường hoặc điền một đáp án trên chính form đã cấp quyền. Hàm thực thi trong realm của tab.
 * @param {HTMLFormElement} form Form công bố ánh xạ trường sang dữ liệu app.
 * @param {object} operation Origin, tên trường và giá trị do backend tự lấy từ record.
 * @return {object} Mô tả trường hoặc kết quả xác minh, không trả giá trị đã điền.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export function operateOnForm(form, { origin, field, value, candidates = [], verifyOnly = false }) {
  if (!form.isConnected || form.ownerDocument.location.origin !== origin ||
      !form.matches('form[data-autoleadpc-mcp="record"]')) return { error: 'Form đã đổi. Hãy ghép lại.' };
  const controls = Array.from(form.elements).filter(control =>
    control.hasAttribute('data-autoleadpc-field') && control.form === form &&
    control.matches('textarea, select:not([multiple]), input') &&
    (control.tagName !== 'INPUT' || ['text','email','tel','url','number','date','radio'].includes(control.type)) &&
    !control.matches(':disabled, [readonly]') && !control.closest('[inert], [hidden], [aria-hidden="true"], [aria-disabled="true"]') &&
    control.getClientRects().length && getComputedStyle(control).visibility === 'visible');
  const groups = new Map();
  for (const control of controls) {
    const key = control.getAttribute('data-autoleadpc-field');
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key)) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(control);
  }
  if (!field) {
    const fields = [];
    for (const [key, members] of groups) {
      const control = members[0];
      const labelElement = control.type === 'radio' ? control.closest('fieldset')?.querySelector('legend') : control.labels?.[0];
      const labelCopy = labelElement?.cloneNode(true);
      for (const nested of labelCopy?.querySelectorAll('input,select,textarea') || []) nested.remove();
      fields.push({ field: key, label: (control.getAttribute('aria-label') || labelCopy?.textContent || key).trim().slice(0, 160),
        kind: control.tagName === 'INPUT' ? control.type : control.localName });
    }
    return { fields };
  }
  const members = groups.get(field);
  if (!members?.length) return { error: 'Trường không còn sẵn sàng.' };
  let control = members[0];
  let expectedOption;
  /**
   * Xác nhận đúng control vẫn thuộc form được ghép và trang đã giữ đáp án của record.
   * @return {{verified: boolean}} Trạng thái ngay sau thao tác hiện tại.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-19
   */
  function verifyAnswer() {
    return { verified: form.isConnected && control.isConnected && control.form === form &&
      control.getAttribute('data-autoleadpc-field') === field && control.getAttribute('aria-invalid') !== 'true' &&
      control.validity?.valid !== false && (control.type === 'radio' ? control.checked :
        expectedOption ? control.selectedIndex === expectedOption.index : control.value === value) };
  }
  if (control.type === 'radio') {
    if (!control.name || members.some(item => item.type !== 'radio' || item.name !== control.name) ||
        Array.from(form.elements).some(item => item.type === 'radio' && item.name === control.name && !members.includes(item))) {
      return { error: 'Nhóm lựa chọn không rõ ràng.' };
    }
    const matches = members.filter(item => candidates.includes(item.value));
    if (matches.length !== 1) return { error: 'Record không khớp một lựa chọn duy nhất.' };
    control = matches[0];
    if (verifyOnly || control.checked) return verifyAnswer();
    control.checked = true;
  } else {
    if (members.length !== 1) return { error: 'Có nhiều trường trùng khóa.' };
    if (control.localName === 'select') {
      const matches = Array.from(control.options).filter(option => !option.disabled && !option.closest('optgroup[disabled]') &&
        (candidates.includes(option.value) || candidates.includes(option.label.trim())));
      if (matches.length !== 1) return { error: 'Record không khớp một lựa chọn duy nhất.' };
      expectedOption = matches[0];
      if (verifyOnly || control.selectedIndex === expectedOption.index) return verifyAnswer();
      control.selectedIndex = expectedOption.index;
    } else {
      if (verifyOnly || control.value === value) return verifyAnswer();
      control.value = value;
    }
  }
  control.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  if (control.isConnected) control.dispatchEvent(new Event('change', { bubbles: true }));
  return verifyAnswer();
}
