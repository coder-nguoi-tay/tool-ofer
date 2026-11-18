/**
 * Tìm option đang hiển thị trong menu custom sau khi trigger được mở.
 * @param {HTMLSelectElement} select Select gốc, chỉ dùng để giữ đúng frame evaluate.
 * @param {{value:string,label:string}} target Option đã được matcher chọn.
 * @return {Element|null} Option có thể click.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
export function findVisibleCustomSelectOption(select, target) {
  const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '');
  const expected = [target.value, target.label].map(normalize).filter(Boolean);
  const selector = '[role="option"], .select2-results__option, .choices__item--selectable, .chosen-results li, [class*="react-select"][class*="option"], .MuiMenuItem-root, [class*="MuiMenuItem-"], .ant-select-item-option, [data-radix-select-item], .dropdown-menu li, .dropdown-menu a, .dropdown-item, ul[class*="dropdown"] li, ul[class*="select"] li, div[class*="dropdown-list"] > *, div[class*="options"] > *';
  let options = Array.from(document.querySelectorAll(selector));
  if (options.length === 0) {
    const activeMenu = document.querySelector('[role="listbox"], [role="menu"], ul.dropdown-menu, .dropdown-menu, [class*="menu"][class*="open"], [class*="dropdown"][class*="show"], [class*="listbox"]');
    if (activeMenu) {
      options = Array.from(activeMenu.querySelectorAll('li, a, button, div'));
    }
  }
  for (const option of options) {
    if (option.closest('[aria-hidden="true"], [inert]') || option.getAttribute('aria-disabled') === 'true' || option.classList.contains('disabled')) continue;
    const style = getComputedStyle(option);
    const rect = option.getBoundingClientRect();
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0' || rect.width <= 0 || rect.height <= 0) continue;
    const text = option.textContent?.trim() || '';
    const values = [option.getAttribute('data-value'), option.getAttribute('value'), text].map(normalize).filter(Boolean);
    if (values.some(value => expected.includes(value))) return option;
  }
  return null;
}
