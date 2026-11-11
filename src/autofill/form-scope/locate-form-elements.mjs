/**
 * Tạo locator chỉ cho các phần tử thuộc form/container đang xử lý.
 * @param {object} frame Page hoặc Frame Playwright.
 * @param {string} selector Selector các trường hoặc nút cần tìm.
 * @param {object|null} formScope Phạm vi đã xác minh của frame.
 * @return {object} Locator của các phần tử trong phạm vi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function locateFormElements(frame, selector, formScope = frame._activeAutofillFormScope) {
  return frame.locator(formScope ? `:is(${selector})${formScope.memberSelector}` : selector);
}
