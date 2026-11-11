import { parseSelectorString } from './parse-selector-string.mjs';

/**
 * Chọn Radio hoặc Checkbox theo văn bản hiển thị.
 * @param {object} page page.
 * @param {*} currentFrame current frame.
 * @param {string} selector selector.
 * @param {string} targetText target text.
 * @return {Promise<void>} Kết quả xử lý handle try select radio by text.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function handleTrySelectRadioByText(page, currentFrame, selector, targetText) {
  const text = String(targetText || '').trim();
  if (!text) return;

  // 1. Nếu có selector chỉ định
  if (selector && selector !== 'auto') {
    const {
      query,
      type
    } = parseSelectorString(selector);
    const container = type === 'xpath' ? currentFrame.locator(`xpath=${query}`) : currentFrame.locator(query);
    const item = container.locator(`xpath=.//*[self::input or self::label][contains(text(), "${text}") or @value="${text}"]`).first();
    if ((await item.count().catch(() => 0)) > 0) {
      await item.scrollIntoViewIfNeeded().catch(() => {});
      await item.click({
        timeout: 3000
      }).catch(() => item.click({
        force: true
      }));
      return;
    }
  }

  // 2. Tìm qua toàn bộ thẻ label
  const labels = await currentFrame.locator('label').all().catch(() => []);
  for (const label of labels) {
    const content = await label.textContent().catch(() => '');
    if (content?.toLowerCase().includes(text.toLowerCase())) {
      await label.scrollIntoViewIfNeeded().catch(() => {});
      await label.click({
        timeout: 3000
      }).catch(() => label.click({
        force: true
      }));
      return;
    }
  }
}
export { handleTrySelectRadioByText };
