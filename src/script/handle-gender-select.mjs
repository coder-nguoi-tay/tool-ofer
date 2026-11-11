import { parseSelectorString } from './parse-selector-string.mjs';

/**
 * Chọn giới tính linh hoạt (hỗ trợ radio button, label, nút bấm, dropdown).
 * @param {object} page page.
 * @param {*} currentFrame current frame.
 * @param {string} selector selector.
 * @param {*} genderValue gender value.
 * @return {Promise<void>} Kết quả xử lý handle gender select.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function handleGenderSelect(page, currentFrame, selector, genderValue) {
  const g = String(genderValue || '').trim().toLowerCase();
  const isMale = /^(m|male|nam|1)/i.test(g);
  const targetLabel = isMale ? 'Male' : 'Female';
  const targetAltLabel = isMale ? 'Nam' : 'Nữ';
  const targetVal = isMale ? 'male' : 'female';

  // 1. Selector tùy chỉnh nếu có
  if (selector && selector !== 'auto' && selector !== '{Gender}' && selector !== '{Sex}') {
    const {
      query,
      type
    } = parseSelectorString(selector);
    const container = type === 'xpath' ? currentFrame.locator(`xpath=${query}`) : currentFrame.locator(query);
    if ((await container.count().catch(() => 0)) > 0) {
      const candidate = container.locator(`xpath=.//*[self::input or self::label or self::button][contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${targetVal}') or contains(translate(@value, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${targetVal}') or contains(translate(@id, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${targetVal}')]`).first();
      if ((await candidate.count().catch(() => 0)) > 0) {
        await candidate.scrollIntoViewIfNeeded().catch(() => {});
        await candidate.click({
          timeout: 3000
        }).catch(() => candidate.click({
          force: true
        }));
        return;
      }
    }
  }

  // 2. Quét radio inputs
  const inputSelectors = [`input[type="radio"][value="${targetLabel}" i]`, `input[type="radio"][value="${targetVal}" i]`, `input[type="radio"][id*="${targetVal}" i]`, `input[type="radio"][name*="gender" i][value*="${targetVal.slice(0, 1)}" i]`];
  for (const sel of inputSelectors) {
    const loc = currentFrame.locator(sel).first();
    if ((await loc.count().catch(() => 0)) > 0) {
      const inputId = await loc.getAttribute('id').catch(() => null);
      if (inputId) {
        const lbl = currentFrame.locator(`label[for="${inputId}"]`).first();
        if ((await lbl.count().catch(() => 0)) > 0) {
          await lbl.scrollIntoViewIfNeeded().catch(() => {});
          await lbl.click({
            timeout: 3000
          }).catch(() => lbl.click({
            force: true
          }));
          return;
        }
      }
      await loc.scrollIntoViewIfNeeded().catch(() => {});
      await loc.click({
        timeout: 3000
      }).catch(() => loc.click({
        force: true
      }));
      return;
    }
  }

  // 3. Quét label
  const labelLoc = currentFrame.locator(`label:has-text("${targetLabel}"), label:has-text("${targetAltLabel}")`).first();
  if ((await labelLoc.count().catch(() => 0)) > 0) {
    await labelLoc.scrollIntoViewIfNeeded().catch(() => {});
    await labelLoc.click({
      timeout: 3000
    }).catch(() => labelLoc.click({
      force: true
    }));
    return;
  }

  // 4. Quét native select dropdown
  const selectLoc = currentFrame.locator('select[name*="gender" i], select[id*="gender" i], select[name*="sex" i]').first();
  if ((await selectLoc.count().catch(() => 0)) > 0) {
    await selectLoc.selectOption({
      label: new RegExp(targetLabel, 'i')
    }, {
      timeout: 3000
    }).catch(() => selectLoc.selectOption({
      value: targetVal
    }, {
      timeout: 3000
    }).catch(() => {}));
  }
}
export { handleGenderSelect };
