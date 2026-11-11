import { US_STATES } from './state/us-states.mjs';
import { delay } from './delay.mjs';
import { parseSelectorString } from './parse-selector-string.mjs';

/**
 * Chọn tiểu bang Hoa Kỳ (hỗ trợ cả mã CA/NY và tên California/New York, native select lẫn react-select/div).
 * @param {object} page page.
 * @param {*} currentFrame current frame.
 * @param {string} selector selector.
 * @param {*} stateValue state value.
 * @return {Promise<void>} Kết quả xử lý handle try select state.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function handleTrySelectState(page, currentFrame, selector, stateValue) {
  const rawState = String(stateValue || '').trim();
  if (!rawState) return;
  const isCode = rawState.length === 2;
  const stateCode = isCode ? rawState.toUpperCase() : Object.entries(US_STATES).find(([_, v]) => v.toLowerCase() === rawState.toLowerCase())?.[0] ?? rawState;
  const stateName = US_STATES[stateCode] || rawState;
  const {
    query,
    type
  } = parseSelectorString(selector);
  const container = type === 'xpath' ? currentFrame.locator(`xpath=${query}`).first() : currentFrame.locator(query).first();
  if ((await container.count().catch(() => 0)) === 0) return;
  const tagName = await container.evaluate(el => el.tagName.toLowerCase()).catch(() => '');
  if (tagName === 'select') {
    await container.selectOption({
      value: stateCode
    }, {
      timeout: 3000
    }).catch(() => container.selectOption({
      label: stateName
    }, {
      timeout: 3000
    })).catch(() => container.selectOption({
      value: stateName
    }, {
      timeout: 3000
    })).catch(() => {});
    return;
  }

  // Custom div / react-select
  await container.scrollIntoViewIfNeeded().catch(() => {});
  await container.click({
    timeout: 3000
  }).catch(() => container.click({
    force: true
  }));
  await delay(200);
  const inputInside = container.locator('input').first();
  if ((await inputInside.count().catch(() => 0)) > 0) {
    await inputInside.fill(stateName).catch(() => {});
    await delay(150);
    await inputInside.press('Enter').catch(() => {});
    return;
  }
  const menuOption = currentFrame.locator(`[role="option"]:has-text("${stateName}"), div[id*="option"]:has-text("${stateName}"), li:has-text("${stateName}")`).first();
  if ((await menuOption.count().catch(() => 0)) > 0) {
    await menuOption.click({
      timeout: 3000
    }).catch(() => menuOption.click({
      force: true
    }));
  }
}
export { handleTrySelectState };
