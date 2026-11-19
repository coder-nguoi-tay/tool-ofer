// Bản giải riêng của offer 2615, chép từ src/autofill/handle-address-select-dropdown.mjs ngày 2026-11-17. Sửa ở đây không ảnh hưởng giải chung.
import { resolveAddressSuggestion } from './select-first-address-suggestion.mjs';

/**
 * Chỉ chọn địa chỉ khớp duy nhất trong select của trường đang điền.
 * @param {object} frame Frame Playwright.
 * @param {object} [record] Bản ghi chứa địa chỉ cần đối chiếu.
 * @param {object|null} [field] Locator ô địa chỉ sở hữu danh sách.
 * @return {Promise<{success:boolean,text?:string}>} Kết quả chọn địa chỉ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export async function handleAddressSelectDropdown(frame, record = {}, field = null) {
  if (!record.address) return { success: false };
  return resolveAddressSuggestion(frame, field, 'select-native', record.address);
}
