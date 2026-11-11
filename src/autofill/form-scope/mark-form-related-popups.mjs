/**
 * Gắn menu ngoài form với control sở hữu qua aria-controls/aria-owns/list hoặc Google Places.
 * @param {object} formScope Phạm vi form đang xử lý.
 * @return {void} Đánh dấu các menu liên quan, không sửa dữ liệu hay click phần tử.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function markFormRelatedPopups(formScope) {
  const inputs = Array.from(document.querySelectorAll('input, select, textarea')).filter(input => input.matches(formScope.memberSelector));
  for (const input of inputs) {
    const ids = [input.getAttribute('aria-controls'), input.getAttribute('aria-owns'), input.getAttribute('list')].filter(Boolean).join(' ').split(/\s+/);
    for (const id of ids) {
      const popup = document.getElementById(id);
      if (popup && popup.getAttribute('data-ux-autofill-owner') !== formScope.id) popup.setAttribute('data-ux-autofill-owner', formScope.id);
    }
  }
  const focused = document.activeElement;
  if (!inputs.includes(focused) || !/address|street|address-line1/i.test([focused.name, focused.id, focused.placeholder, focused.autocomplete].join(' '))) return;
  for (const popup of document.querySelectorAll('.pac-container')) {
    if (popup.getAttribute('data-ux-autofill-owner') !== formScope.id) popup.setAttribute('data-ux-autofill-owner', formScope.id);
  }
}
