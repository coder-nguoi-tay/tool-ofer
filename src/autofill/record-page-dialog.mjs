const VALIDATION_DIALOG = /please (enter|select|provide|fill|choose|complete)|required|invalid|incorrect|format|must (be|enter)|vui lòng|bắt buộc|không hợp lệ/i;

/**
 * Ghi lại dialog gần nhất của tab (đồng bộ, trước khi accept) để submit biết website vừa chặn bằng alert lỗi nhập liệu.
 *
 * @param {object} page Tab Playwright.
 * @param {{message: () => string, type: () => string}} dialog Dialog Playwright.
 * @return {{at: number, message: string, type: string, validation: boolean}} Bản ghi dialog.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function recordPageDialog(page, dialog) {
  const message = String(dialog.message?.() || '').slice(0, 200);
  page._uxLastDialog = { at: Date.now(), message, type: dialog.type?.() || '', validation: VALIDATION_DIALOG.test(message) };
  return page._uxLastDialog;
}
