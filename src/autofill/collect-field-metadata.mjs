/**
 * Đọc nhãn riêng của từng ô và gợi ý nhập để đối chiếu định danh kỹ thuật với ý nghĩa hiển thị.
 * @param {Element} element Ô nhập được Playwright truyền vào trong frame hiện tại.
 * @return {object} Nhãn, placeholder, tên ứng viên, kiểu và trạng thái ô nhập.
 * @throws {never} Liên kết nhãn không còn tồn tại được bỏ qua.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export function collectFieldMetadata(element) {
  const labels = [];
  const fieldHints = [];
  const referencedLabels = [];
  if (element.labels) {
    for (const l of element.labels) {
      const t = (l.innerText || l.textContent || '').trim();
      if (t) labels.push(t);
    }
  }
  for (const labelId of (element.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean)) {
    const label = element.getRootNode().getElementById?.(labelId);
    const text = (label?.innerText || label?.textContent || '').trim();
    if (text) referencedLabels.push(text);
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
    const labelSpan = labels.length === 0 && parentField.querySelectorAll('input:not([type="hidden"]), select, textarea').length === 1
      ? parentField.querySelector('.label-entry, .fieldlabel, .field-label, .control-label, .label, label') : null;
    if (labelSpan) {
      const t = (labelSpan.innerText || labelSpan.textContent || '').trim();
      if (t && !labels.includes(t)) labels.push(t);
    }
    const dataTag = parentField.getAttribute('data-tag') || parentField.getAttribute('data-field');
    if (dataTag) fieldHints.push(dataTag);
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
  const ariaLabelledByText = referencedLabels.join(' ');
  const ariaLabel = (element.getAttribute('aria-label') || '').trim();
  const accessibleName = ariaLabelledByText || ariaLabel || labels.join(' ');
  const isReq = Boolean(element.required) || element.getAttribute('aria-required') === 'true' || element.classList.contains('required') || element.classList.contains('error') || [...labels, ...referencedLabels].some(l => /(^|\s)\*|\*(\s|$)/.test(l));
  return {
    id: element.id || '',
    name: element.getAttribute('name') || '',
    label: labels.join(' '),
    accessibleName,
    ariaLabelledByText,
    placeholder: element.getAttribute('placeholder') || '',
    ariaLabel,
    autocomplete: element.getAttribute('autocomplete') || '',
    classes: `${element.className || ''} ${container ? container.className || '' : ''}`,
    dataAttributes,
    required: isReq,
    ariaRequired: element.getAttribute('aria-required') === 'true',
    isRequired: isReq,
    checked: Boolean(element.checked),
    names: [accessibleName, vectorField, element.getAttribute('placeholder'), element.getAttribute('name'), element.id, element.getAttribute('autocomplete'), element.getAttribute('data-name'), element.getAttribute('data-field'), element.getAttribute('data-testid'), element.getAttribute('data-qa'), element.getAttribute('data-tf-element-role'), element.getAttribute('data-leadid-type'), ...Object.values(dataAttributes), ...fieldHints, element.getAttribute('title'), ...labels.filter(l => l && l.length <= 60)].filter(Boolean),
    containerText: containerText.slice(0, 400),
    kind: element.tagName.toLowerCase(),
    type: element.getAttribute('type')?.toLowerCase(),
    value: element.value,
    readOnly: element.readOnly,
    maxLength: element.maxLength
  };
}
