/**
 * Đọc metadata từ DOM trong frame; hàm được Playwright thực thi trực tiếp trong trang.
 * @param {Element} element Phần tử hoặc dữ liệu được Playwright truyền vào.
 * @return {*} Kết quả kiểm tra DOM.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function collectFieldMetadata(element) {
  const labels = [];
  if (element.labels) {
    for (const l of element.labels) {
      const t = (l.innerText || l.textContent || '').trim();
      if (t) labels.push(t);
    }
  }
  if (element.id && labels.length === 0) {
    try {
      const directLabel = document.querySelector(`label[for="${element.id}"]`);
      if (directLabel) {
        const t = (directLabel.innerText || directLabel.textContent || '').trim();
        if (t) labels.push(t);
      }
    } catch {}
  }

  // Trích xuất label và data-tag từ container cấu trúc Uplevel Rewards (#reg-container, .field-item)
  const parentField = element.closest('.field-item, .field, .form-group, .input-group, .reg-fields');
  if (parentField) {
    const labelSpan = parentField.querySelector('.label-entry, .fieldlabel, .field-label, .control-label, .label, label');
    if (labelSpan) {
      const t = (labelSpan.innerText || labelSpan.textContent || '').trim();
      if (t && !labels.includes(t)) labels.push(t);
    }
    const dataTag = parentField.getAttribute('data-tag') || parentField.getAttribute('data-field');
    if (dataTag && !labels.includes(dataTag)) labels.push(dataTag);
  }
  const container = element.closest('.form-group, .input-group, .field, .input-container, .form-row, .field-group, .form-field, .consent-box, .consent-row, label, tr, td, p, div');
  let containerText = '';
  if (container) {
    try {
      const clone = container.cloneNode(true);
      clone.querySelectorAll('select, script, style').forEach(s => s.remove());
      containerText = (clone.innerText || clone.textContent || '').trim();
    } catch {
      containerText = (container.innerText || container.textContent || '').trim();
    }
  }
  const prev = element.previousElementSibling;
  const prevText = prev ? (prev.innerText || prev.textContent || '').trim() : '';
  const next = element.nextElementSibling;
  const nextText = next ? (next.innerText || next.textContent || '').trim() : '';
  const dataAttributes = {};
  if (element.attributes) {
    for (const attr of element.attributes) {
      if (attr.name.startsWith('data-')) dataAttributes[attr.name] = attr.value;
    }
  }
  const vectorField = element.getAttribute('data-vector-field') || '';
  const isReq = Boolean(element.required) || element.getAttribute('aria-required') === 'true' || element.classList.contains('required') || element.classList.contains('error') || labels.some(l => /(^|\s)\*|\*(\s|$)/.test(l));
  return {
    id: element.id || '',
    name: element.getAttribute('name') || '',
    classes: `${element.className || ''} ${container ? container.className || '' : ''}`,
    dataAttributes,
    required: isReq,
    ariaRequired: element.getAttribute('aria-required') === 'true',
    isRequired: isReq,
    checked: Boolean(element.checked),
    names: [element.getAttribute('aria-label'), vectorField, element.getAttribute('placeholder'), element.getAttribute('name'), element.id, element.getAttribute('autocomplete'), element.getAttribute('data-name'), element.getAttribute('data-field'), element.getAttribute('data-testid'), element.getAttribute('data-qa'), element.getAttribute('data-tf-element-role'), element.getAttribute('data-leadid-type'), ...Object.values(dataAttributes), element.getAttribute('title'), ...labels.filter(l => l && l.length <= 60)].filter(Boolean),
    containerText: containerText.slice(0, 400),
    kind: element.tagName.toLowerCase(),
    type: element.getAttribute('type')?.toLowerCase(),
    value: element.value,
    readOnly: element.readOnly,
    maxLength: element.maxLength
  };
}
