/**
 * Đọc nhóm Yes/No hiển thị thuộc bước hiện tại; tạo selector riêng không phụ thuộc id trùng.
 * @param {object|null} scope Phạm vi form/bước đang được autofill xử lý.
 * @return {object} Nhóm lựa chọn và chữ ký câu hỏi, không thực hiện click hoặc điền dữ liệu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function inspectYesNoStep(scope) {
  const visible = element => {
    if (!element || scope && !element.matches(scope.memberSelector)) return false;
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (node.hidden || node.hasAttribute('inert') || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    }
    return element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0;
  };
  const ready = element => !element.matches(':disabled') && !element.closest('[aria-disabled="true"], [aria-busy="true"]');
  const label = element => (element.labels?.[0]?.textContent || element.getAttribute('aria-label') || element.textContent || element.value || '').trim().toLowerCase();
  const selected = element => Boolean(element.checked) || ['aria-checked', 'aria-pressed', 'aria-selected'].some(name => element.getAttribute(name) === 'true') || element.matches('.selected,.active,.checked,.chosen') || Boolean(element.control?.checked || element.querySelector('input:checked'));
  const groups = new Map();
  for (const element of document.querySelectorAll('input[type="radio"],input[type="checkbox"],button,[role="radio"],[role="button"],label,a,[onclick],.btn-option')) {
    if (element.tagName === 'LABEL' && element.control) continue;
    if (element.matches('a,[onclick],.btn-option') && element.querySelector('input[type=radio],input[type=checkbox],button,[role=radio],[role=button]')) continue;
    if ((!visible(element) && !Array.from(element.labels || []).some(visible)) || !ready(element)) continue;
    const text = label(element);
    const yes = /^(yes|có)$/.test(text) || /^yes$/i.test(element.value || '') && element.matches('input[type=radio],input[type=checkbox]');
    const no = /^(no|không)$/.test(text) || /^no$/i.test(element.value || '') && element.matches('input[type=radio],input[type=checkbox]');
    if (!yes && !no) continue;
    let container = element.closest('[class*="twy-campaign-container"], [id^="twy-campaign"]:not([id^="twy-campaigns"]), fieldset, [role="radiogroup"], .yes_no_btns, .question, .survey-question') || element.parentElement;
    // Các lựa chọn tùy biến có wrapper riêng: gom về vùng gần nhất chứa cả Yes và No.
    if ((element.type !== 'radio' || !element.name) && container && !container.matches('fieldset,[role=radiogroup],.question,.survey-question')) {
      for (let parent = container; parent && !parent.matches('body,html'); parent = parent.parentElement) {
        if (scope && !parent.matches(scope.memberSelector)) break;
        const answers = Array.from(parent.querySelectorAll('button,a,label,[role=radio],[role=button],[onclick],.btn-option')).map(label);
        if (answers.some(text => /^(yes|có)$/.test(text)) && answers.some(text => /^(no|không)$/.test(text))) { container = parent; break; }
      }
    }
    const key = element.type === 'radio' && element.name ? `${element.form?.id || ''}:${element.name}` : container;
    if (!groups.has(key)) groups.set(key, { container, yes: null, no: null });
    groups.get(key)[yes ? 'yes' : 'no'] = element;
  }
  const pairs = [...groups.values()].filter(group => group.yes && group.no);
  const marker = element => {
    let id = element.getAttribute('data-ux-yes-no-target');
    if (!id) { id = `yn-${Date.now()}-${Math.random().toString(36).slice(2)}`; element.setAttribute('data-ux-yes-no-target', id); }
    return `[data-ux-yes-no-target="${id}"]`;
  };
  const questions = pairs.map(group => ({
    yes: marker(group.yes), no: marker(group.no), yesSelected: selected(group.yes), noSelected: selected(group.no),
    twy: /twyinput/.test(group.yes.id),
    identity: `${group.container.id}:${group.yes.name || ''}:${(group.container.querySelector('legend,h1,h2,h3,.question-title,.twy-cqlabel')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300)}`,
  }));
  return { url: location.href, questions };
}
