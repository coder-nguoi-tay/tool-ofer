import { reportSelectMismatch } from './report-select-mismatch.mjs';

/**
 * Xử lý trường không khớp dữ liệu lead và các select câu hỏi độc lập.
 * @param {object} context Trường hoặc frame đang xử lý cùng dữ liệu và tiến độ của lượt quét.
 * @return {Promise<boolean>} True khi cần bỏ qua trường hiện tại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function handleUnmatchedField({
  valueToFill,
  metadata,
  field,
  frame,
  page,
  session,
  frameProgress,
  unmatchedFieldNames,
  record,
  options
}) {
  if (!valueToFill) {
    // Select khảo sát do solver xử lý qua chuột; không đoán dữ liệu record hoặc đổi DOM tại đây.
    if (metadata.kind === 'select') {
      const answered = await field.evaluate(select => {
        const option = select.options[select.selectedIndex];
        return Boolean(option && !option.disabled && option.value && !/^(0|-1|none|placeholder|default|select)$/i.test(option.value) && !/^(select|choose|chọn|vui lòng|pick|--|\.\.\.|please select)/i.test(option.text.trim()) && select.validity.valid);
      }).catch(() => false);
      if (!answered && !await field.getAttribute('data-survey-dropdown-uid').catch(() => null)) reportSelectMismatch(frame || field, metadata, [], { reason: 'survey_or_record_selection_pending' }, options, page);
      return true;
    }
    const displayName = metadata.names[0] ?? '';
    if (displayName) unmatchedFieldNames.add(displayName.slice(0, 40));
    // Log chẩn đoán: ô không tìm được giá trị + liệt kê các key record đang có
    const recKeys = record && typeof record === 'object' ? Object.keys(record).filter(k => record[k] !== '' && record[k] !== null && record[k] !== undefined).slice(0, 20) : [];
    options.onLog?.({
      type: 'field_unmatched',
      field: metadata.id || metadata.name || displayName,
      names: (metadata.names || []).slice(0, 6),
      recordKeys: recKeys,
      detail: `[Scan] Không tìm giá trị cho ô "${metadata.id || displayName}" (names=${(metadata.names || []).slice(0, 4).join(' | ')}; record keys=${recKeys.join(',') || 'EMPTY'})`
    });
    return true;
  }
  return false;
}
