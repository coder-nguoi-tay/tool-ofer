import { resolveAddressSuggestion } from './select-first-address-suggestion.mjs';

/**
 * Kiểm tra có gợi ý thuộc ô hiện tại trước khi chọn.
 * @param {object} page Page Playwright.
 * @param {object|null} [frame] Frame sở hữu ô nhập.
 * @param {object|null} [field] Ô nhập đang điền.
 * @return {Promise<boolean>} Có gợi ý phù hợp và xác định được chủ sở hữu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export async function hasActiveAddressSuggestions(page, frame = null, field = null) {
  return (await resolveAddressSuggestion(frame || page, field, 'inspect')).success;
}
