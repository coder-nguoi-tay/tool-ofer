import { findMatchingSelectOption } from './find-matching-select-option.mjs';

/**
 * Chọn đúng option theo giá trị hoặc alias đầy đủ; không dùng prefix và không lấy option đầu dự phòng.
 * Dùng cho select dạng list và các caller tương thích; dropdown dùng executor chuột/phím riêng.
 * @param {HTMLSelectElement} select Field cần điền.
 * @param {string[]} candidates Các giá trị/nhãn tương đương đã xác định theo record.
 * @return {object} matched, verified và option giữ được sau khi website nhận change.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function selectMatchingOption(select, candidates) {
  const target = findMatchingSelectOption(select, candidates);
  if (!target.matched) return target;
  const selected = select.options[target.index];
  select.value = selected.value;
  selected.selected = true;
  for (const type of ['input','change','blur']) select.dispatchEvent(new Event(type, { bubbles: true }));
  const verified = select.value === selected.value;
  return { ...target, verified, reason: verified ? 'option_verified' : 'value_not_retained' };
}
