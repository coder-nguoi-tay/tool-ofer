import { humanClick } from '../human-click.mjs';
import { waitForInputPacing } from '../interaction/wait-for-input-pacing.mjs';

/**
 * Chọn option của native select bằng click và phím, có fallback tương thích trên macOS.
 * @param {object} context Page, select và option đích đã được matcher chọn.
 * @return {Promise<object>} Kết quả chọn và xác minh giá trị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function selectNativeOptionWithHumanInteraction({ page, field, target }) {
  // onchange của một số form (co-reg TMG…) chuyển trang ngay khi chọn: phần tử rời DOM nên đọc lại giá trị lỗi.
  // Phân biệt với "không giữ giá trị" để không báo select_value_unmatched sai trên trang mới.
  const readSelectValue = async () => {
    try {
      return { value: await field.inputValue() };
    } catch {
      return { value: '', detached: !(await field.evaluate(element => element.isConnected).catch(() => false)) };
    }
  };
  if (!page?.mouse || !page?.keyboard) return { ...target, verified: false, reason: 'interaction_unavailable' };
  if (!await humanClick(page, field)) return { ...target, verified: false, reason: 'click_failed' };
  await waitForInputPacing(page);
  const targetPosition = await field.evaluate((select, targetIndex) => Array.from(select.options).filter(option => !option.disabled && !option.closest('optgroup[disabled]')).findIndex(option => option.index === targetIndex), target.index);
  if (targetPosition < 0) return { ...target, verified: false, reason: 'option_unavailable' };
  await page.keyboard.press('Home');
  for (let index = 0; index < targetPosition; index++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  let read = await readSelectValue();
  if (read.value === target.value) return { ...target, verified: true, reason: 'option_verified' };
  if (read.detached) return { ...target, verified: false, reason: 'navigated' };

  // Popup native trên macOS không luôn nhận phím qua CDP. Chỉ fallback sau khi đã click và thử phím.
  await field.selectOption({ index: target.index }, { timeout: 2000 }).catch(() => {});
  read = await readSelectValue();
  if (read.value === target.value) return { ...target, verified: true, reason: 'option_verified_hybrid' };
  return { ...target, verified: false, reason: read.detached ? 'navigated' : 'value_not_retained' };
}
