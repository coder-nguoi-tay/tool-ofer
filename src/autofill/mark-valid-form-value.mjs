/**
 * Ghi nhận đúng giá trị hiện tại sau khi kiểm tra ràng buộc HTML và trạng thái lỗi của form.
 * @param {HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement} control Ô đã nhập hoặc chọn.
 * @param {string} expectedValue Giá trị vừa đọc và đối chiếu từ chính ô này.
 * @return {boolean} True khi ô còn giữ giá trị hợp lệ và đã được đánh dấu.
 * @throws {never} Ô đã rời DOM hoặc không còn hợp lệ được bỏ qua.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export function markValidFormValue(control, expectedValue) {
  if (!control.isConnected || control.value !== expectedValue || !control.value.trim()
      || control.matches(':disabled') || control.validity?.valid === false
      || control.getAttribute('aria-invalid') === 'true') {
    control.removeAttribute('data-ux-filled');
    return false;
  }
  control.dataset.uxFilled = '1';
  return true;
}
