import { humanClick } from '../human-click.mjs';
import { waitForInputPacing } from '../interaction/wait-for-input-pacing.mjs';
import { findVisibleCustomSelectOption } from './find-visible-custom-select-option.mjs';

/**
 * Mở custom dropdown bằng trigger và chọn option đã khớp bằng chuột.
 * @param {object} context Page, select gốc, trigger hiển thị và option đích.
 * @return {Promise<object>} Kết quả chọn và xác minh giá trị select gốc.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function selectCustomOptionWithHumanInteraction({ page, field, trigger, target }) {
  if (!await humanClick(page, trigger)) return { ...target, verified: false, reason: 'click_failed' };
  await waitForInputPacing(page);
  let option;
  let optionHandle;
  const deadline = Date.now() + 2000;
  do {
    optionHandle = await field.evaluateHandle(findVisibleCustomSelectOption, target);
    option = optionHandle.asElement();
    if (option) break;
    await optionHandle.dispose();
    await new Promise(resolve => setTimeout(resolve, 80));
  } while (Date.now() < deadline);
  try {
    if (!option) {
      await page.keyboard.press('Escape').catch(() => {});
      return { ...target, verified: false, reason: 'option_not_visible' };
    }
    if (!await humanClick(page, option)) return { ...target, verified: false, reason: 'option_click_failed' };
  } finally {
    await optionHandle.dispose();
  }
  const deadlineVerification = Date.now() + 1500;
  let actualValue = '';
  do {
    actualValue = await field.inputValue().catch(() => '');
    if (actualValue === target.value) return { ...target, verified: true, reason: 'option_verified' };
    await new Promise(resolve => setTimeout(resolve, 80));
  } while (Date.now() < deadlineVerification);
  return { ...target, verified: false, reason: 'value_not_retained' };
}
