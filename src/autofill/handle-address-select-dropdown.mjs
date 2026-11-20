import { resolveAddressSuggestion } from './select-first-address-suggestion.mjs';

/**
 * Chọn địa chỉ khớp đầu tiên trong select của trường đang điền.
 * @param {object} frame Frame Playwright.
 * @param {object} [record] Bản ghi chứa địa chỉ cần đối chiếu.
 * @param {object|null} [field] Locator ô địa chỉ sở hữu danh sách.
 * @return {Promise<{success:boolean,text?:string}>} Kết quả chọn địa chỉ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export async function handleAddressSelectDropdown(frame, record = {}, field = null) {
  if (!record.address) return { success: false };
  return resolveAddressSuggestion(frame, field, 'select-native', record.address);
}
