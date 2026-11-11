import { parseSelectorString } from './parse-selector-string.mjs';

/**
 * Tạo Playwright locator thông minh từ chuỗi selector và index (1-based theo WinForms).
 * Nếu không thấy trên main frame, tự động quét qua các iframe.
 * @param {object} page page.
 * @param {*} currentFrame current frame.
 * @param {string} selectorInput selector input.
 * @param {number} oneBasedIndex one based index.
 * @return {Promise<*>} Kết quả xử lý resolve smart locator.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function resolveSmartLocator(page, currentFrame, selectorInput, oneBasedIndex = 1) {
  const {
    type,
    query
  } = parseSelectorString(selectorInput);
  const idx = Math.max(0, (parseInt(oneBasedIndex, 10) || 1) - 1);
  async function getLocFromFrame(f) {
    if (type === 'xpath') {
      return f.locator(`xpath=${query}`).nth(idx);
    }
    if (type === 'css') {
      return f.locator(query).nth(idx);
    }
    // Type 'auto': ưu tiên ID, sau đó Name, sau đó CSS/text
    const idLoc = f.locator(`#${query}`).first();
    if ((await idLoc.count().catch(() => 0)) > 0) return idLoc;
    const nameLoc = f.locator(`[name="${query}"]`).first();
    if ((await nameLoc.count().catch(() => 0)) > 0) return nameLoc;
    return f.locator(query).nth(idx);
  }
  let loc = await getLocFromFrame(currentFrame);
  if ((await loc.count().catch(() => 0)) > 0) {
    return loc;
  }

  // Quét các iframe nếu trang hiện tại chưa thấy phần tử
  if (page?.frames) {
    for (const frame of page.frames()) {
      if (frame === currentFrame) continue;
      const fLoc = await getLocFromFrame(frame);
      if ((await fLoc.count().catch(() => 0)) > 0) {
        return fLoc;
      }
    }
  }
  return loc;
}
export { resolveSmartLocator };
