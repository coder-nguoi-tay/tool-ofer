import { addVerifiedFieldCount } from './add-verified-field-count.mjs';

/**
 * Xử lý trường không khớp dữ liệu lead và các select câu hỏi độc lập.
 * @param {object} context Trường hoặc frame đang xử lý cùng dữ liệu và tiến độ của lượt quét.
 * @return {Promise<boolean>} True khi cần bỏ qua trường hiện tại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleUnmatchedField({
  valueToFill,
  metadata,
  field,
  session,
  frameProgress,
  unmatchedFieldNames,
  record,
  options
}) {
  if (!valueToFill) {
    // Nếu là thẻ select câu hỏi (như Yes/No, câu hỏi khảo sát) mà không khớp trường trong record:
    // Tự động chọn ngẫu nhiên một option hợp lệ (ngoại trừ option placeholder đầu tiên)!
    if (metadata.kind === 'select' && (!metadata.value || metadata.value === '')) {
      const picked = await field.evaluate(sel => {
        const validOptions = Array.from(sel.options).filter((opt, idx) => {
          if (idx === 0 && (!opt.value || /select|choose|chọn|vui lòng/i.test(opt.text))) return false;
          return Boolean(opt.value);
        });
        if (validOptions.length > 0) {
          const chosen = validOptions[Math.floor(Math.random() * validOptions.length)];
          sel.value = chosen.value;
          sel.dispatchEvent(new Event('input', {
            bubbles: true
          }));
          sel.dispatchEvent(new Event('change', {
            bubbles: true
          }));
          return true;
        }
        return false;
      }).catch(() => false);
      if (picked) {
        const verifyVal = await field.evaluate(el => el.value || '').catch(() => '');
        if (!verifyVal || verifyVal.trim() === '') {
          return true;
        }
        await field.evaluate(el => {
          el.dataset.uxFilled = '1';
        }).catch(() => {});
        addVerifiedFieldCount(session, 1);
        frameProgress.filledInThisPass += 1;
        return true;
      }
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
