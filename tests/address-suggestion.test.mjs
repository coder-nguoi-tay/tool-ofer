import assert from 'node:assert/strict';
import test from 'node:test';
import { ADDRESS_SUGGESTION_SELECTORS, selectFirstAddressSuggestion } from "../autofill.mjs";

/**
 * Mô phỏng locator Playwright cho một kết quả địa chỉ khi evaluate toàn trang chưa chọn được.
 * @param {object} suggestion Locator của kết quả địa chỉ cần kiểm tra.
 * @return {object} Context có evaluate, count và nth như Playwright.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function createSuggestionContext(suggestion) {
  return {
    evaluate: async () => null,
    locator: (selector) => ({
      count: async () => selector === ADDRESS_SUGGESTION_SELECTORS[0] ? 1 : 0,
      nth: () => suggestion,
    }),
  };
}

test('địa chỉ: không click lần hai khi DOM đã chọn thành công', async () => {
  let clickCount = 0;
  const page = createSuggestionContext({
    isVisible: async () => true,
    evaluate: async () => true,
    click: async () => { clickCount++; },
  });
  assert.equal(await selectFirstAddressSuggestion(page), true);
  assert.equal(clickCount, 0);
});

test('địa chỉ: dùng locator click khi thao tác DOM thất bại', async () => {
  let clickCount = 0;
  const page = createSuggestionContext({
    isVisible: async () => true,
    evaluate: async () => { throw new Error('DOM unavailable'); },
    click: async () => { clickCount++; },
  });
  assert.equal(await selectFirstAddressSuggestion(page), true);
  assert.equal(clickCount, 1);
});

test('địa chỉ: cả DOM và click lỗi thì trả false và không ghi log thành công', async () => {
  const logs = [];
  const page = createSuggestionContext({
    isVisible: async () => true,
    evaluate: async () => { throw new Error('detached'); },
    click: async () => { throw new Error('detached'); },
  });
  assert.equal(await selectFirstAddressSuggestion(page, null, null, { onLog: (entry) => logs.push(entry) }), false);
  assert.deepEqual(logs, []);
});

test('địa chỉ: vẫn thử frame sau khi gợi ý trên trang chính không chọn được', async () => {
  const page = createSuggestionContext({
    isVisible: async () => true,
    evaluate: async () => { throw new Error('detached'); },
    click: async () => { throw new Error('detached'); },
  });
  const frame = createSuggestionContext({ isVisible: async () => true, click: async () => {} });
  assert.equal(await selectFirstAddressSuggestion(page, frame), true);
});
