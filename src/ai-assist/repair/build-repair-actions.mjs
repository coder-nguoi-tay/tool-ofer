import { resolveProvidedFieldValue } from '../../autofill/record-values/resolve-provided-field-value.mjs';

/**
 * Tạo repair actions chỉ từ dữ liệu có thật; submit luôn thuộc pipeline autofill.
 * @param {object} diagnostic Kết quả validation hiện tại.
 * @param {object} record Record phiên.
 * @param {object} session Email đã gán cho phiên.
 * @param {Function} onLog Callback chẩn đoán thiếu dữ liệu.
 * @return {object} actions và danh sách field không có dữ liệu để sửa.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function buildRepairActions(diagnostic, record, session, onLog) {
  const actions = [], missing = [];
  const fields = [...(diagnostic.emailMissing && diagnostic.emailInput ? [diagnostic.emailInput] : []), ...diagnostic.problemInputs];
  const seen = new Set();
  for (const field of fields) {
    if (!field.selector || seen.has(field.selector)) continue;
    seen.add(field.selector);
    if (field.type === 'checkbox' && field.required) { actions.push({ action: 'check', selector: field.selector }); continue; }
    const value = resolveProvidedFieldValue({ ...field, names: [field.name,field.id,field.placeholder].filter(Boolean), kind: field.tag }, record, session);
    if (value == null || value === '') {
      missing.push(field.id || field.name || field.selector);
      onLog?.({ type: 'missing_record', field: field.id || field.name || null, detail: 'Chưa có dữ liệu để sửa field; không tạo dữ liệu mẫu.' });
      continue;
    }
    actions.push({ action: field.tag === 'select' ? 'select' : 'fill', selector: field.selector, value: String(value) });
  }
  return { actions, missing };
}
