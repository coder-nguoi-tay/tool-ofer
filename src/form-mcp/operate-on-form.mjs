/**
 * Đọc trường đã khai báo hoặc áp dụng đúng đáp án record trong realm của form đã cấp quyền.
 * @param {HTMLFormElement} form Form công bố các trường cho app.
 * @param {object} operation Origin, trường, metadata dự kiến và đáp án lấy từ record.
 * @return {object} Metadata hoặc trạng thái khi thao tác, hoặc control để kiểm tra địa chỉ cùng form.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export function operateOnForm(form, { origin, field, value, choiceValue, candidates = [], verifyOnly = false, requireSingle = false, expected, describeField = false, expectedControl, locateAddress = false, addressInput, choice }) {
  if (!form.isConnected || form.ownerDocument.location.origin !== origin ||
      (requireSingle && form.ownerDocument.querySelectorAll('form[data-autoleadpc-mcp="record"]').length !== 1) ||
      !form.matches('form[data-autoleadpc-mcp="record"]')) {
    return requireSingle ? { stale: true } : { error: 'Form đã đổi. Hãy ghép lại.' };
  }
  const elements = Array.from(form.elements);
  const groups = new Map();
  for (const control of elements) {
    const key = control.getAttribute('data-autoleadpc-field');
    if ((field && key !== field) || !key || !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key) || control.form !== form ||
        !control.matches('textarea, select, input') ||
        (control.tagName === 'INPUT' && !['text','email','tel','url','number','date','radio','checkbox'].includes(control.type) &&
          !(control.type === 'search' && key === 'address' && control.getAttribute('role') === 'combobox')) ||
        control.matches(':disabled, [readonly]') || control.closest('[inert], [hidden], [aria-hidden="true"], [aria-disabled="true"]') ||
        !control.getClientRects().length || getComputedStyle(control).visibility !== 'visible') continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(control);
  }
  const fields = [];
  const invalidFields = [];
  for (const [key, members] of groups) {
    if (field && key !== field) continue;
    const control = members[0];
    const grouped = control.type === 'radio' || (control.type === 'checkbox' && members.length > 1);
    const labelElement = grouped ? control.closest('fieldset')?.querySelector('legend') : control.labels?.[0];
    const labelCopy = labelElement?.cloneNode(true);
    for (const nested of labelCopy?.querySelectorAll('input,select,textarea') || []) nested.remove();
    const referenced = (control.getAttribute('aria-labelledby') || '').split(/\s+/)
      .map(id => control.getRootNode().getElementById?.(id)?.textContent?.trim()).filter(Boolean).join(' ');
    const label = (referenced || control.getAttribute('aria-label') || labelCopy?.textContent?.trim() || control.placeholder || key).trim().slice(0, 160);
    if (!field && requireSingle && members.some(item => item.validity?.valid === false || item.getAttribute('aria-invalid') === 'true')) invalidFields.push(key);
    const kind = control.tagName === 'INPUT' ? control.type : control.localName === 'select' && control.hasAttribute('multiple') ? 'select-multiple' : control.localName;
    fields.push({ field: key, label, kind });
  }
  if (!field) return requireSingle ? { fields, invalidFields } : { fields };
  const members = groups.get(field);
  if (!members || (expected && (expected.label !== fields[0].label || expected.kind !== fields[0].kind))) {
    return requireSingle ? { stale: true } : { error: 'Trường hoặc nhãn đã đổi.' };
  }
  const control = members[0];
  const metadata = { ...fields[0], name: control.name, id: control.id, autocomplete: control.autocomplete, placeholder: control.placeholder };
  if (describeField) return metadata;
  if (expectedControl && Object.keys(metadata).some(key => metadata[key] !== expectedControl[key])) return { stale: true, verified: false };
  const ambiguous = { error: 'Record không khớp một lựa chọn duy nhất.' };
  if (locateAddress && members.length === 1 && control.matches('input:not([type]), input[type=text], input[type=search], input[type=tel], textarea')) return control;
  if (addressInput) {
    if (control !== addressInput || control.value !== choice.display) return { verified: false };
    if (choice.retained || choice.pending) {
      return requireSingle ? { verified: choice.retained, changed: false } : { verified: choice.retained };
    }
  }
  const changes = [];
  let matchesAnswer;
  const multiSelect = control.localName === 'select' && control.hasAttribute('multiple');
  if (control.type === 'checkbox' || multiSelect) {
    if (choiceValue == null) return { error: 'Thiếu đáp án khai báo riêng cho trường chọn.' };
    if (elements.some(item => item.getAttribute('data-autoleadpc-field') === field && !members.includes(item)) ||
        members.some(item => item.type !== control.type) || (multiSelect && members.length !== 1)) return ambiguous;
    const choices = multiSelect ? Array.from(control.options) : members;
    const wanted = new Set();
    if (control.type === 'checkbox' && members.length === 1 && /^(true|false)$/i.test(choiceValue)) {
      if (choiceValue.toLowerCase() === 'true') wanted.add(control);
    } else {
      let answers = [choiceValue];
      if (choiceValue.startsWith('[')) {
        try { answers = JSON.parse(choiceValue); } catch { return ambiguous; }
      }
      if (!Array.isArray(answers) || answers.some(answer => typeof answer !== 'string' || !answer.trim())) return ambiguous;
      for (const answer of answers) {
        const options = choices.filter(item => item.value === answer || (multiSelect && item.label.trim() === answer));
        if (options.length !== 1 || wanted.has(options[0])) return ambiguous;
        wanted.add(options[0]);
      }
    }
    const property = multiSelect ? 'selected' : 'checked';
    const differing = choices.filter(item => item[property] !== wanted.has(item));
    if (differing.some(item => item.disabled || item.closest('optgroup[disabled]'))) return ambiguous;
    matchesAnswer = () => choices.every(item => item[property] === wanted.has(item));
    if (!verifyOnly) {
      for (const item of differing) item[property] = wanted.has(item);
      if (multiSelect && differing.length) changes.push(control);
      else changes.push(...differing);
    }
  } else if (control.type === 'radio') {
    if (!control.name || members.some(item => item.type !== 'radio' || item.name !== control.name) ||
        elements.some(item => item.type === 'radio' && item.name === control.name && !members.includes(item))) return ambiguous;
    const matches = members.filter(item => candidates.includes(item.value));
    if (matches.length !== 1) return ambiguous;
    const target = matches[0];
    matchesAnswer = () => target.checked;
    if (!verifyOnly && !matchesAnswer()) { target.checked = true; changes.push(target); }
  } else {
    if (members.length !== 1) return { error: 'Có nhiều trường trùng khóa.' };
    let targetValue = value;
    let property = 'value';
    if (control.localName === 'select') {
      const matches = Array.from(control.options).filter(option => !option.disabled && !option.closest('optgroup[disabled]') &&
        (candidates.includes(option.value) || candidates.includes(option.label.trim())));
      if (matches.length !== 1) return ambiguous;
      property = 'selectedIndex';
      targetValue = matches[0].index;
    }
    matchesAnswer = () => control[property] === targetValue;
    if (!verifyOnly && !matchesAnswer()) {
      if (addressInput) {
        if (control._autoleadAddressChoice?.query !== value) delete control._autoleadAddressChoice;
        control._autoleadAddressQuery = value;
      }
      control[property] = targetValue;
      changes.push(control);
    }
  }
  for (const changed of changes) {
    if (!changed.isConnected || changed.form !== form) continue;
    changed.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    if (changed.isConnected) changed.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const verified = !choice?.requiresSelection && form.isConnected && matchesAnswer() && members.every(item => item.isConnected && item.form === form &&
    item.getAttribute('data-autoleadpc-field') === field && item.getAttribute('aria-invalid') !== 'true' && item.validity?.valid !== false);
  return requireSingle ? { verified, changed: changes.length > 0 } : choice?.requiresSelection && changes.length ? { verified, pending: true } : { verified };
}
