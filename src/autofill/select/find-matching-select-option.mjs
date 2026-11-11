/**
 * Tìm option khớp dữ liệu mà không thay đổi DOM của select.
 * @param {HTMLSelectElement} select Select cần đọc.
 * @param {string[]} candidates Giá trị hoặc nhãn được phép chọn.
 * @return {object} Thông tin option khớp hoặc lý do không tìm thấy.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function findMatchingSelectOption(select, candidates) {
  const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '');
  const options = Array.from(select.options).filter(option => !option.disabled && !option.closest('optgroup[disabled]'));
  let selected;
  for (const candidate of candidates) {
    selected = options.find(option => normalize(option.value) === normalize(candidate));
    if (selected) break;
  }
  if (!selected) for (const candidate of candidates) {
    selected = options.find(option => normalize(option.text || option.label) === normalize(candidate));
    if (selected) break;
  }
  if (!selected || select.disabled) return { matched: false, verified: false, reason: 'option_unmatched' };
  return {
    matched: true,
    index: Array.from(select.options).indexOf(selected),
    value: selected.value,
    label: selected.text || selected.label
  };
}
