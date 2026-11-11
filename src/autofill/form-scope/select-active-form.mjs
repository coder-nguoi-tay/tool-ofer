/**
 * Chọn form đang hiển thị trong document và đánh dấu các control liên kết ngoài form.
 * @param {object} context Định danh phạm vi cũ và định danh cấp mới từ phía ứng dụng.
 * @return {object|null} Phạm vi biểu mẫu cùng selector thành viên, hoặc null nếu không có.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function selectActiveForm({ previousId, nextId, flowId }) {
  const controlSelector = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea';
  const excluded = 'header, footer, nav, aside, [role="search"], .site-footer, .site-header, .offerwall-card, form[data-tf-element-role="offer"]';
  /**
   * Kiểm tra phần tử của biểu mẫu còn hiển thị qua toàn bộ các phần tử cha.
   * @param {Element} element Control hoặc vùng biểu mẫu cần kiểm tra.
   * @return {boolean} Phần tử đang hiển thị.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-11
   */
  const visible = element => {
    if (!element || !element.isConnected) return false;
    for (let parent = element; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (parent.hidden || parent.hasAttribute('inert') || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    }
    const bounds = element.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0;
  };
  const activeFlowId = flowId || nextId;
  const candidates = new Map();
  for (const control of document.querySelectorAll(controlSelector)) {
    if (!visible(control) || control.closest(excluded) || control.type === 'search') continue;
    let root = control.closest('[id^="sign_up_step"]') || control.form || control.closest('[role="form"], .form-step.active, .step.active, .form-container, .survey-container, .quiz-container, [id^="twy-campaigns-"], .twy-campaigns, .twy-customquestion, .loco-widget, #reg-container, #ai-funnel, .form');
    if (!root) {
      for (let parent = control.parentElement; parent && !parent.matches('body, html'); parent = parent.parentElement) {
        if (parent.matches('.input-group, .field, .form-group, .autocomplete')) continue;
        if (Array.from(parent.querySelectorAll('button, input[type="submit"], [role="button"]')).some(visible)) { root = parent; break; }
      }
    }
    if (!root || root.closest(excluded)) continue;
    if (!candidates.has(root)) candidates.set(root, { root, count: 0, focused: false, modal: Boolean(root.closest('[role=dialog], [aria-modal=true], .modal.show, .MuiDialog-root')) });
    const candidate = candidates.get(root);
    candidate.count++;
    if (document.activeElement === control) candidate.focused = true;
  }
  for (const form of document.forms) {
    if (candidates.has(form) || form.closest(excluded)) continue;
    if (Array.from(form.elements).some(element => element.type === 'submit' && visible(element))) candidates.set(form, { root: form, count: 0, focused: false, modal: Boolean(form.closest('[role=dialog], [aria-modal=true], .modal.show, .MuiDialog-root')) });
  }
  for (const container of document.querySelectorAll('[id^="sign_up_step"], [role="form"], .form-step.active, .step.active, .current-step, .survey-step.active, #questionText, #ai-funnel, .survey-container, .quiz-container, [id^="twy-campaigns-"], .twy-campaigns')) {
    if (candidates.has(container) || container.closest(excluded) || !visible(container)) continue;
    if (Array.from(container.querySelectorAll('button, [role="button"]')).some(visible)) candidates.set(container, { root: container, count: 0, focused: false });
  }
  const previous = previousId ? document.querySelector('[data-ux-autofill-scope="' + previousId + '"]') : null;
  const ranked = [...candidates.values()].filter(candidate => candidate.modal || candidate.focused || candidate.root.matches('[id^="sign_up_step"]') || candidate.root.getAttribute('data-ux-autofill-deferred') !== activeFlowId).sort((first, second) => Number(second.modal) - Number(first.modal) || Number(second.focused) - Number(first.focused) || Number(second.root === previous) - Number(first.root === previous) || (first.root.matches('[id^="sign_up_step"]') && second.root.matches('[id^="sign_up_step"]') && first.root.closest('form') === second.root.closest('form') ? (first.root.compareDocumentPosition(second.root) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1) : second.count - first.count));
  const root = ranked[0]?.root || previous;
  if (!root) return null;
  root.removeAttribute('data-ux-autofill-deferred');
  for (const candidate of candidates.values()) {
    if (!(candidate.root.matches('[id^="sign_up_step"]') && root.matches('[id^="sign_up_step"]') && candidate.root.closest('form') === root.closest('form')) && candidate.root !== root && !candidate.root.contains(root) && !root.contains(candidate.root) && candidate.root.getAttribute('data-ux-autofill-deferred') !== activeFlowId) candidate.root.setAttribute('data-ux-autofill-deferred', activeFlowId);
  }
  const id = root.getAttribute('data-ux-autofill-scope') || nextId;
  if (root.getAttribute('data-ux-autofill-scope') !== id) root.setAttribute('data-ux-autofill-scope', id);
  for (const oldOwner of document.querySelectorAll('[data-ux-autofill-owner="' + id + '"]')) {
    if (oldOwner.matches('input, select, textarea, button') && oldOwner.form && oldOwner.form !== root) oldOwner.removeAttribute('data-ux-autofill-owner');
  }
  if (root.tagName === 'FORM') {
    for (const control of root.elements) if (!root.contains(control) && control.getAttribute('data-ux-autofill-owner') !== id) control.setAttribute('data-ux-autofill-owner', id);
  }
  const rootSelector = '[data-ux-autofill-scope="' + id + '"]';
  const memberSelector = ':is(' + rootSelector + ', ' + rootSelector + ' *, [data-ux-autofill-owner="' + id + '"], [data-ux-autofill-owner="' + id + '"] *)';
  return { id, flowId: activeFlowId, rootSelector, memberSelector, nativeForm: root.tagName === 'FORM', active: Boolean(ranked[0]), modal: ranked[0]?.modal || false, focused: ranked[0]?.focused || false, visibleFieldCount: ranked[0]?.count || 0 };
}
