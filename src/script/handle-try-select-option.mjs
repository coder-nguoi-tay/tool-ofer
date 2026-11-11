import { delay } from './delay.mjs';
import { parseSelectorString } from './parse-selector-string.mjs';
import { selectByValue } from './select-by-value.mjs';

/**
 * Chọn tùy chọn trong Dropdown (native hoặc custom menu).
 * @param {object} page page.
 * @param {*} currentFrame current frame.
 * @param {string} selector selector.
 * @param {*} targetValue target value.
 * @return {Promise<void>} Kết quả xử lý handle try select option.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function handleTrySelectOption(page, currentFrame, selector, targetValue) {
  const val = String(targetValue || '').trim();
  const {
    query,
    type
  } = parseSelectorString(selector);
  const container = type === 'xpath' ? currentFrame.locator(`xpath=${query}`).first() : currentFrame.locator(query).first();
  if ((await container.count().catch(() => 0)) === 0) return;
  const tagName = await container.evaluate(el => el.tagName.toLowerCase()).catch(() => '');
  if (tagName === 'select') {
    await selectByValue(container, val);
    return;
  }

  // Custom container
  await container.scrollIntoViewIfNeeded().catch(() => {});
  await container.click({
    timeout: 3000
  }).catch(() => container.click({
    force: true
  }));
  await delay(200);
  const optionLoc = currentFrame.locator(`[role="option"]:has-text("${val}"), div[id*="option"]:has-text("${val}"), li:has-text("${val}")`).first();
  if ((await optionLoc.count().catch(() => 0)) > 0) {
    await optionLoc.click({
      timeout: 3000
    }).catch(() => optionLoc.click({
      force: true
    }));
  }
}
export { handleTrySelectOption };
