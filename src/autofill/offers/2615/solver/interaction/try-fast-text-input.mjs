// Bản giải riêng của offer 2615, chép từ src/autofill/interaction/try-fast-text-input.mjs ngày 2026-11-17. Sửa ở đây không ảnh hưởng giải chung.
import { waitForInputPacing } from './wait-for-input-pacing.mjs';
import { humanClick } from '../human-click.mjs';
import { recordInputFillHtml } from '../../../../../logging/record-input-fill-html.mjs';

/**
 * Click xong, giữ nhịp hiển thị rồi điền; chỉ chuyển ô sau khi website giữ đúng giá trị.
 * @param {object} field Locator ô nhập đang xử lý trong hàng đợi gõ của page.
 * @param {string} value Giá trị lấy từ record đã resolve.
 * @param {object|null} page Tab cần rê chuột tới ô trước khi điền nhanh, nếu có.
 * @return {Promise<boolean>} True khi nhập và blur giữ đúng giá trị, false để caller thử đường tương thích.
 * @throws {never} Lỗi nhập trả về false; lỗi ghi HTML không ảnh hưởng thao tác.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export async function tryFastTextInput(field, value, page = null) {
  if (typeof field.fill !== 'function' || typeof field.inputValue !== 'function') return false;
  try {
    if (page?.mouse && !await humanClick(page, field)) return false;
    await waitForInputPacing(page);
    await recordInputFillHtml(field, page);
    await field.fill(value, { timeout: 1500 });
    if (typeof field.press === 'function') await field.press('Tab', { timeout: 500 }).catch(() => {});
    await waitForInputPacing(page);
    const actual = await field.inputValue({ timeout: 500 });
    if (actual.trim().toLowerCase() === value.trim().toLowerCase()) return true;
    return /^[+\d\s().-]+$/.test(value) && actual.replace(/\D/g, '') === value.replace(/\D/g, '');
  } catch { return false; }
}
