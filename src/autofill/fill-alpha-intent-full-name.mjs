import { tryFastTextInput } from './interaction/try-fast-text-input.mjs';
import { locateFormElements } from './form-scope/locate-form-elements.mjs';
/**
 * Điền ô họ tên Alpha Intent bằng dữ liệu record rồi xác minh giá trị còn giữ sau blur.
 *
 * @param {object} frame Frame chứa form Alpha Intent.
 * @param {object} record Bản ghi người dùng, không tạo tên thay thế.
 * @return {Promise<boolean>} True nếu ô họ tên giữ được giá trị hợp lệ.
 * @throws {never} Lỗi locator được xử lý và trả về false.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
async function fillAlphaIntentFullName(frame, record = {}) {
  const fullName = String(record.fullname || '').trim();
  const combinedName = [record.firstname, record.lastname].filter(Boolean).join(' ').trim();
  const name = fullName.split(/\s+/).length >= 2 ? fullName : combinedName;
  if (name.split(/\s+/).length < 2 || typeof frame.locator !== 'function') return false;
  const field = locateFormElements(frame, '#alpha-intent-content input[data-testid="fullname-input"], #alpha-intent-content .ai-input-container-fullname input#name, #ai-funnel input[data-testid="fullname-input"], #ai-funnel .ai-input-container-fullname input#name, #ai-funnel input#name, input[data-testid="fullname-input"], .alpha-intent-content input#name');
  if (!(await field.count().catch(() => 0)) || !(await field.isVisible().catch(() => false)) || !(await field.isEditable({ timeout: 1000 }).catch(() => false))) return false;
  try {
    const current = (await field.inputValue({ timeout: 1000 })).trim();
    if (current === name && (await field.getAttribute('data-ux-filled', { timeout: 1000 }).catch(() => null)) === '1') return false;
    if (current !== name) {
      const page = typeof frame.page === 'function' ? frame.page() : frame;
      if (!await tryFastTextInput(field, name, page)) return false;
    }
    await field.press('Tab', {
      timeout: 1000
    });
    const actual = (await field.inputValue({ timeout: 1000 })).trim();
    if (actual !== name) return false;
    await field.evaluate(el => {
      el.dataset.uxFilled = '1';
    }, undefined, { timeout: 1000 });

    // Đồng bộ trường required ẩn #input-fullname (data-hidden-required="true") để validation không fail.
    // Không invent giá trị: chỉ sao chép từ #name đã điền thành công.
    if (typeof frame.evaluate === 'function') {
      await frame.evaluate(val => {
        const hidden = document.getElementById('input-fullname');
        if (hidden && hidden.readOnly) {
          hidden.value = val;
          hidden.dispatchEvent(new Event('input', {
            bubbles: true
          }));
          hidden.dispatchEvent(new Event('change', {
            bubbles: true
          }));
        }
      }, name).catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
}
export { fillAlphaIntentFullName };
