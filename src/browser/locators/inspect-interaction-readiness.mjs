/**
 * Xác minh control và nhãn liên kết vẫn hiển thị, thuộc form và không bị widget khóa.
 * @param {Element} element Control cần thao tác.
 * @param {object|null} formScope Phạm vi form đang xử lý.
 * @return {object} Trạng thái ready và lý do từ chối thao tác.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function inspectInteractionReadiness(element, formScope) {
  if (formScope && !element.matches?.(formScope.memberSelector)) return { ready: false, reason: 'outside_active_form' };
  if (formScope?.nativeForm && element.form && element.form !== document.querySelector(formScope.rootSelector)) return { ready: false, reason: 'outside_active_form' };
  if (element.matches?.(':disabled, [aria-disabled="true"]') || element.closest?.('[aria-disabled="true"], [aria-busy="true"], [inert]')) return { ready: false, reason: 'element_disabled' };
  /**
   * Xét toàn bộ tổ tiên thay vì chỉ kích thước của control.
   * @param {Element|null} target Control hoặc nhãn thực sự được hiển thị.
   * @return {boolean} Target có vùng tương tác hiển thị.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-11
   */
  const visible = target => {
    if (!target || formScope && !target.matches?.(formScope.memberSelector)) return false;
    for (let ancestor = target; ancestor; ancestor = ancestor.parentElement) {
      const style = typeof getComputedStyle === 'function' ? getComputedStyle(ancestor) : (ancestor.style || {});
      if (ancestor.hidden || ancestor.hasAttribute?.('inert') || style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility) || style.opacity === '0') return false;
    }
    const bounds = typeof target.getBoundingClientRect === 'function' ? target.getBoundingClientRect() : { width: 0, height: 0 };
    return bounds.width > 0 && bounds.height > 0;
  };
  if (visible(element)) return { ready: true };
  const checkable = element.matches?.('input[type="checkbox"], input[type="radio"]');
  const labels = checkable ? Array.from(element.labels || []) : [];
  return labels.some(visible) ? { ready: true, useLabel: true } : { ready: false, reason: 'element_not_visible' };
}
