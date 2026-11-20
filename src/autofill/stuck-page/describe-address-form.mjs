import { readEvidenceWithTimeout } from '../../logging/recorder/read-evidence-with-timeout.mjs';

/**
 * Đọc trạng thái native của form địa chỉ ngay trước khi watchdog tải lại tab.
 * @param {string|null} scopeSelector Phạm vi đã chọn trong frame, hoặc null nếu chưa có.
 * @return {string} Tóm tắt trạng thái bằng các nhãn cố định, rỗng nếu form không xác định.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export function describeAddressForm(scopeSelector) {
  const root = scopeSelector ? document.querySelector(scopeSelector) : document;
  if (!root) return '';
  const widgets = [...root.querySelectorAll('input[data-type="address"][data-populated]')]
    .filter(input => input.form && input.getClientRects().length && getComputedStyle(input).visibility !== 'hidden');
  if (widgets.length !== 1) return '';
  const address = widgets[0];
  const fields = [...address.form.elements];
  const checkedRadioNames = new Set(fields.filter(control => control.type === 'radio' && control.checked && control.name).map(control => control.name));
  const issues = new Set();
  for (const control of fields) {
    if (!control.matches('input, select, textarea') || control.matches(':disabled, [readonly], input[type=hidden]')) continue;
    let missing = false;
    if (control.hasAttribute('required')) {
      if (control.type === 'radio') missing = !control.checked && !checkedRadioNames.has(control.name);
      else if (control.type === 'checkbox') missing = !control.checked;
      else missing = !control.value;
    }
    if (!missing && control.validity?.valid !== false && control.getAttribute('aria-invalid') !== 'true') continue;
    const identifier = [control.name, control.id, control.autocomplete].join(' ').toLowerCase();
    if (control === address) issues.add('địa chỉ');
    else if (/phone|tel/.test(identifier)) issues.add('điện thoại');
    else if (/birth|dob|bday/.test(identifier)) issues.add('ngày sinh');
    else if (/gender/.test(identifier)) issues.add('giới tính');
    else if (/email/.test(identifier)) issues.add('email');
    else if (/name/.test(identifier)) issues.add('họ tên');
    else if (control.type === 'checkbox') issues.add('ô đánh dấu');
    else issues.add('trường khác');
  }
  const submitters = fields.filter(control => control.matches('button:not([type]), button[type=submit], input[type=submit], input[type=image]'));
  const visible = submitters.filter(button => button.getClientRects().length && getComputedStyle(button).visibility !== 'hidden');
  let submitState = 'không thấy nút gửi HTML';
  if (visible.length) {
    submitState = visible.some(button => !button.matches(':disabled') && !button.closest('[aria-disabled=true], [aria-busy=true], [inert]'))
      ? 'có nút gửi HTML đang bật' : 'nút gửi HTML đang khóa';
    if (visible.some(button => button.hasAttribute('data-ux-scoped-submit'))) submitState += ', có dấu autofill nhận diện nút';
    else submitState += ', chưa thấy dấu autofill nhận diện nút';
  }
  const accepted = address.getAttribute('data-populated') === 'true';
  return ` Địa chỉ ${accepted ? 'đã' : 'chưa'} được trang xác nhận. Trường bắt buộc thiếu hoặc báo lỗi: ${[...issues].join(', ') || 'không thấy'}. Trạng thái gửi: ${submitState}.`;
}

/**
 * Thu thập lý do chờ trong frame của lượt quét, giới hạn thời gian đọc renderer.
 * @param {object} page Tab sắp tải lại.
 * @return {Promise<string>} Mô tả để nối vào log vòng đời của tab.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export async function readStalledAddressFormStatus(page) {
  const frame = page._activeAutofillFrame || page.mainFrame?.();
  if (!frame?.evaluate) return '';
  const selector = frame._activeAutofillFormScope?.rootSelector || null;
  return readEvidenceWithTimeout(frame, 'stalled-address', () => frame.evaluate(describeAddressForm, selector)).catch(() => '');
}
