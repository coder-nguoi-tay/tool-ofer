/**
 * Tìm trigger đang hiển thị của custom dropdown gắn với một select gốc bị ẩn.
 * @param {HTMLSelectElement} select Select gốc cần thao tác.
 * @return {Element|null} Trigger có thể click bằng chuột.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function findVisibleCustomSelectTrigger(select) {
  const visible = element => {
    if (!element || element.disabled || element.getAttribute('aria-disabled') === 'true') return false;
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (node.hidden || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
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
    select.parentElement
  ].filter(Boolean);
  const selector = '.select2-selection, .chosen-single, .choices__inner, [role="combobox"], [aria-haspopup="listbox"]';
  for (const container of containers) {
    const candidates = [container.matches(selector) ? container : null, ...container.querySelectorAll(selector)].filter(Boolean);
    const trigger = candidates.find(visible);
    if (trigger) return trigger;
  }
  return null;
}
