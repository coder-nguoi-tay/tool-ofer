// Bản giải riêng của offer 2615, chép từ src/autofill/find-submit-button.mjs ngày 2026-11-17. Sửa ở đây không ảnh hưởng giải chung.
import { resolveActiveFormScope } from '../../../form-scope/resolve-active-form-scope.mjs';
import { findScopedSubmitButton } from './form-scope/find-scoped-submit-button.mjs';

/**
 * Tìm nút gửi trong phạm vi form hoặc câu hỏi đang hoạt động của chính frame này.
 * @param {object} frame Frame hoặc Page của Playwright.
 * @param {object|null} formScope Phạm vi đã xác minh hoặc tự xác định nếu bỏ trống.
 * @return {Promise<object|null>} Locator nút gửi, hoặc null khi chưa xác minh được phạm vi.
 * @throws {never} Lỗi đọc DOM trả về null.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export async function findSubmitButton(frame, formScope) {
  const activeScope = formScope === undefined ? await resolveActiveFormScope(frame) : formScope;
  return findScopedSubmitButton(frame, activeScope);
}
