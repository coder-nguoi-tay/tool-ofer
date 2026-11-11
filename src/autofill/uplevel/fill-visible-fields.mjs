import { buildUplevelVisibleFieldValues } from './build-visible-field-values.mjs';
import { locateFormElements } from '../form-scope/locate-form-elements.mjs';
import { tryFastTextInput } from '../interaction/try-fast-text-input.mjs';
import { waitForInputPacing } from '../interaction/wait-for-input-pacing.mjs';
import { selectOptionWithHumanInteraction } from '../select/select-option-with-human-interaction.mjs';

/**
 * Rê/click và điền lần lượt ô Uplevel, đợi ô hiện tại hoàn tất trước khi chuyển chuột.
 * @param {object} frame Frame chứa form Uplevel đang hoạt động.
 * @param {object} record Dữ liệu của phiên, giữ ánh xạ Uplevel hiện có.
 * @return {Promise<number>} Số ô thực sự giữ được giá trị sau thao tác.
 * @throws {Error} Frame đóng hoặc đổi DOM giữa các thao tác; caller xử lý dừng lượt đồng bộ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function fillUplevelVisibleFields(frame, record) {
  if (!await frame.locator('#reg-container, #global-reg, #cid-global').count()) return 0;
  const page = typeof frame.page === 'function' ? frame.page() : frame;
  let filled = 0;
  for (const entry of buildUplevelVisibleFieldValues(record)) {
    if (!entry.value) continue;
    const field = locateFormElements(frame, entry.selector).first();
    if (!await field.count() || !await field.isVisible() || !await field.isEnabled({ timeout: 1000 })) continue;
    const current = await field.inputValue({ timeout: 1000 }).catch(() => '');
    if (current.trim().length >= entry.minimum) continue;
    let verified;
    if (entry.select) {
      verified = (await selectOptionWithHumanInteraction({ page, field, candidates: [entry.value] })).verified;
      await waitForInputPacing(page);
    } else {
      if (!await field.isEditable({ timeout: 1000 })) continue;
      verified = await tryFastTextInput(field, entry.value, page);
    }
    if (!verified) continue;
    await field.evaluate(element => { element.dataset.uxFilled = '1'; }, undefined, { timeout: 1000 }).catch(() => {});
    filled++;
  }
  return filled;
}
