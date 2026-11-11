/**
 * Kiểm tra xem một phần tử HTML có đang hiển thị trên màn hình hay không.
 *
 * @param {Element} el Phần tử DOM cần kiểm tra.
 * @return {boolean} True nếu phần tử hiển thị và có kích thước thực tế.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function isElementVisibleInDOM(el) {
  if (!el) return false;
  const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
  if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) {
    return false;
  }
  if (el.closest('[aria-hidden="true"], [inert], .inactive, .hidden, .hide')) {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}
export { isElementVisibleInDOM };
