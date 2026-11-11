/**
 * Đọc bằng chứng lựa chọn do website thiết lập; không dùng marker riêng của autofill để tự xác minh.
 * @param {Element} element Option hoặc nhãn của lựa chọn.
 * @return {boolean} Native checked, ARIA hoặc class trạng thái lựa chọn của website.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function inspectSelectionState(element) {
  if (!element?.isConnected) return false;
  if (element.matches('input[type="checkbox"],input[type="radio"]')) return element.checked;
  if (element.matches('select')) return element.selectedIndex >= 0 && Boolean(element.value);
  if (['aria-checked','aria-selected','aria-pressed'].some(attribute => element.getAttribute(attribute) === 'true')) return true;
  if (['selected','active','checked','chosen'].some(name => element.classList.contains(name))) return true;
  if (element.querySelector('input:checked,[aria-checked="true"],[aria-selected="true"],[aria-pressed="true"]')) return true;
  const label = element.closest('label');
  return Boolean(label?.control?.checked || label?.querySelector('input:checked'));
}
