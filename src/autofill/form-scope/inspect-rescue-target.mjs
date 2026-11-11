/**
 * Định danh chính field lỗi đang hiển thị, tránh trùng id hoặc mượn control của form khác.
 * @param {object} context Field báo lỗi và phạm vi hiện tại.
 * @return {string|null} Selector marker của target cần repair.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function inspectRescueTarget({ fieldInfo, formScope }) {
  const elements = Array.from(document.querySelectorAll('input,textarea,select'));
  const target = elements.find(element => {
    if (element.disabled || element.readOnly || element.type === 'hidden' || formScope && !element.matches(formScope.memberSelector)) return false;
    if (fieldInfo.id && element.id !== fieldInfo.id && element.name !== fieldInfo.id) return false;
    if (!fieldInfo.id && !element.required) return false;
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      if (ancestor.hidden || ancestor.hasAttribute('inert') || style.display === 'none' || ['hidden','collapse'].includes(style.visibility) || style.opacity === '0') return false;
    }
    const bounds = element.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0;
  });
  if (!target || Date.now() - Number(target.getAttribute('data-ux-typing') || 0) < 15000) return null;
  const marker = crypto.randomUUID();
  target.setAttribute('data-ux-rescue-target',marker);
  return `[data-ux-rescue-target="${marker}"]`;
}
