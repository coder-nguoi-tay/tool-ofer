// Bản giải riêng của offer 2615, chép từ src/autofill/form-scope/inspect-rescue-target.mjs ngày 2026-11-17. Sửa ở đây không ảnh hưởng giải chung.
/**
 * Định danh chính field lỗi đang hiển thị, tránh trùng id hoặc mượn control của form khác.
 * @param {object} context Field báo lỗi và phạm vi hiện tại.
 * @return {{selector:string,state:unknown[]}|null} Trường lỗi và trạng thái quyết định có cần thử lại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
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
  const marker = target._autoleadRescueId ||= crypto.randomUUID();
  target.setAttribute('data-ux-rescue-target',marker);
  return {
    selector: `[data-ux-rescue-target="${marker}"]`,
    state: [target.name, target.type, target.value, target.checked, target.placeholder, target.autocomplete,
      target.validationMessage, target.getAttribute('aria-invalid'), target.getAttribute('aria-label'),
      [...(target.labels || [])].map(label => label.textContent),
      (target.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent),
      target.options && [...target.options].map(option => [option.value, option.label, option.disabled, option.selected])]
  };
}
