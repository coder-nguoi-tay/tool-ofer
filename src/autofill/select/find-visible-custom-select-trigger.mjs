/**
 * Tìm trigger đang hiển thị của custom dropdown gắn với một select gốc bị ẩn.
 * @param {HTMLSelectElement} select Select gốc cần thao tác.
 * @return {Element|null} Trigger có thể click bằng chuột.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
export function findVisibleCustomSelectTrigger(select) {
  const visible = element => {
    if (element?.form && element.tagName === 'BUTTON' && element.type === 'submit') return false;
    if (!element || element.disabled || element.getAttribute('aria-disabled') === 'true') return false;
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (node.hasAttribute('inert') || node.getAttribute('aria-busy') === 'true' || node.getAttribute('aria-disabled') === 'true' || node.hidden || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  if (visible(select) && select.getAttribute('aria-hidden') !== 'true' && !select.classList.contains('select2-hidden-accessible')) return null;
  const sibling = select.nextElementSibling;
  const containers = [
    sibling,
    select.closest('.choices'),
    select.closest('.select2'),
    select.closest('[class*="react-select"]'),
    select.closest('[class*="MuiSelect"]'),
    select.closest('.form-group, .field-group, div[class*="select"], div[class*="dropdown"]'),
    select.parentElement
  ].filter(Boolean);
  const selector = '.select2-selection, .chosen-single, .choices__inner, [role="combobox"], [aria-haspopup="listbox"], .react-select__control, [class*="react-select"][class*="control"], [class*="css-"][class*="-control"], .MuiSelect-select, [class*="MuiSelect-select"], .ant-select-selector, .dropdown-toggle, button[data-bs-toggle="dropdown"], [class*="select-trigger"], [class*="select-box"], [class*="custom-select-trigger"], button[class*="dropdown"], button[class*="select"]';
  for (const container of containers) {
    const candidates = [container.matches(selector) ? container : null, ...container.querySelectorAll(selector)].filter(Boolean);
    const trigger = candidates.find(visible);
    if (trigger) return trigger;
  }
  return null;
}
