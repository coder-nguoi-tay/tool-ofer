/**
 * Loại control của form khác hoặc bước đã ẩn trước khi gõ/chọn và gây cuộn trang.
 * @param {Element} element Control được Playwright kiểm tra trong trang.
 * @param {object} formScope Phạm vi hiện tại của frame.
 * @return {boolean} True khi control thuộc đúng form và không bị ẩn bởi phần tử cha.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function isControlInActiveForm(element, formScope) {
  if (!element.matches(formScope.memberSelector)) return false;
  if (formScope.nativeForm && element.form && element.form !== document.querySelector(formScope.rootSelector)) return false;
  for (let parent = element; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (parent.hidden || parent.hasAttribute('inert') || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  }
  return true;
}
