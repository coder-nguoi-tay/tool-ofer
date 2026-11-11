import { findMatchingSelectOption } from './find-matching-select-option.mjs';
import { findVisibleCustomSelectTrigger } from './find-visible-custom-select-trigger.mjs';
import { selectCustomOptionWithHumanInteraction } from './select-custom-option-with-human-interaction.mjs';
import { selectMatchingOption } from './select-matching-option.mjs';
import { selectNativeOptionWithHumanInteraction } from './select-native-option-with-human-interaction.mjs';

/**
 * Điều phối chọn option theo record cho native select, custom dropdown hoặc select dạng danh sách.
 * @param {object} context Page, field và các candidate đã được so khớp theo record.
 * @return {Promise<object>} Kết quả chọn và xác minh giá trị giữ được sau thao tác.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function selectOptionWithHumanInteraction({ page, field, candidates }) {
  const target = await field.evaluate(findMatchingSelectOption, candidates);
  if (!target.matched) return target;
  const state = await field.evaluate(select => ({
    currentValue: select.value,
    multiple: select.multiple,
    size: select.size
  }));
  if (state.currentValue === target.value) return { ...target, verified: true, reason: 'option_verified' };

  // Select dạng danh sách không có popup; giữ cách chọn tương thích cho multiple/size > 1.
  if (state.multiple || state.size > 1) return field.evaluate(selectMatchingOption, candidates);

  const triggerHandle = await field.evaluateHandle(findVisibleCustomSelectTrigger);
  try {
    const trigger = triggerHandle.asElement();
    if (trigger) return await selectCustomOptionWithHumanInteraction({ page, field, trigger, target });
    return await selectNativeOptionWithHumanInteraction({ page, field, target });
  } finally {
    await triggerHandle.dispose();
  }
}
