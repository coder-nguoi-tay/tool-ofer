import { waitForInputPacing } from './wait-for-input-pacing.mjs';
import { humanClick } from '../human-click.mjs';

/**
 * Click xong, giữ nhịp hiển thị rồi điền; chỉ chuyển ô sau khi website giữ đúng giá trị.
 * @param {object} field Locator ô nhập đang xử lý trong hàng đợi gõ của page.
 * @param {string} value Giá trị lấy từ record đã resolve.
 * @param {object|null} page Tab cần rê chuột tới ô trước khi điền nhanh, nếu có.
 * @return {Promise<boolean>} True khi nhập và blur giữ đúng giá trị, false để caller thử đường tương thích.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function tryFastTextInput(field, value, page = null) {
  if (typeof field.fill !== 'function' || typeof field.inputValue !== 'function') return false;
  try {
    if (page?.mouse && !await humanClick(page, field)) return false;
    await waitForInputPacing(page);
    await field.fill(value, { timeout: 1500 });
    if (typeof field.press === 'function') await field.press('Tab', { timeout: 500 }).catch(() => {});
    await waitForInputPacing(page);
    const actual = await field.inputValue({ timeout: 500 });
    if (actual.trim().toLowerCase() === value.trim().toLowerCase()) return true;
    return /^[+\d\s().-]+$/.test(value) && actual.replace(/\D/g, '') === value.replace(/\D/g, '');
  } catch { return false; }
}
