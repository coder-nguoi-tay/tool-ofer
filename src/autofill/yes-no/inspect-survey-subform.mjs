/**
 * Kiểm tra ô cần điền và cặp Save/Cancel thuộc subform đang hiển thị trong scope.
 * @param {object|null} scope Phạm vi form/bước hiện tại.
 * @return {object} needsInput và saveSelector; không thực hiện click hoặc thay đổi giá trị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function inspectSurveySubform(scope) {
  const visible = element => {
    if (!element || scope && !element.matches(scope.memberSelector)) return false;
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (node.hidden || node.hasAttribute('inert') || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    }
    return element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0;
  };
  const ready = element => !element.matches(':disabled') && !element.closest('[aria-disabled="true"], [aria-busy="true"]');
  const marker = element => {
    let id = element.getAttribute('data-ux-yes-no-target');
    if (!id) { id = `yn-${Date.now()}-${Math.random().toString(36).slice(2)}`; element.setAttribute('data-ux-yes-no-target', id); }
    return `[data-ux-yes-no-target="${id}"]`;
  };
  const requiredChoiceMissing = Array.from(document.querySelectorAll('input[type=checkbox][required]')).some(element => visible(element) && ready(element) && !element.checked);
  const needsInput = requiredChoiceMissing || Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([type="button"]):not([type="submit"]),textarea,select'))
    .some(element => visible(element) && ready(element) && !element.readOnly && (!element.value || !element.validity.valid));
  const buttons = Array.from(document.querySelectorAll('button,input[type=button],input[type=submit],[role=button]')).filter(visible);
  const save = buttons.find(element => /^(save|save changes|lưu|lưu lại)$/i.test((element.textContent || element.value || '').trim()));
  const cancel = buttons.find(element => /^(cancel|hủy|huỷ)$/i.test((element.textContent || element.value || '').trim()));
  const saveContainer = save?.closest('form,[role=dialog],[role=form],.modal,.subform,.twy-campaign-container') || save?.parentElement;
  const saveSelector = save && cancel && saveContainer?.contains(cancel) ? marker(save) : null;
  return { needsInput, saveSelector };
}
