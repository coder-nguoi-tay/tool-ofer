// Bản giải riêng của offer 2615, chép từ src/autofill/alpha-intent/fill-identified-alpha-field.mjs ngày 2026-11-17. Sửa ở đây không ảnh hưởng giải chung.
import { collectFieldMetadata } from '../collect-field-metadata.mjs';
import { matchFieldValue } from '../match-field-value.mjs';
import { tryFastTextInput } from '../interaction/try-fast-text-input.mjs';

/**
 * Chỉ nhập nhanh khi dữ liệu Alpha Intent phù hợp nhãn nghiệp vụ của chính ô đó.
 * @param {object} field Locator ô nhập đã kiểm tra hiển thị và editable.
 * @param {string} value Dữ liệu nhánh đặc thù dự định nhập.
 * @param {object} page Tab sở hữu ô nhập.
 * @param {object} record Record dùng chung với luồng nhận diện form.
 * @return {Promise<boolean>} True khi giá trị đã nhập và được xác minh.
 * @throws {never} Không đọc được nhãn hoặc nhãn mâu thuẫn thì nhường luồng điền chung.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export async function fillIdentifiedAlphaField(field, value, page, record) {
  const metadata = await field.evaluate(collectFieldMetadata, undefined, { timeout: 1000 }).catch(() => null);
  if (!metadata) return false;
  if (metadata.accessibleName) {
    const matched = matchFieldValue(metadata.names, record, metadata);
    if (matched === null) return false;
    const expected = String(matched).trim().replace(/\s+/g, ' ').toLowerCase();
    const proposed = String(value).trim().replace(/\s+/g, ' ').toLowerCase();
    const sameNumericValue = /^[\d\s()+./-]+$/.test(expected) && /^[\d\s()+./-]+$/.test(proposed)
      && expected.replace(/\D/g, '') === proposed.replace(/\D/g, '');
    if (expected !== proposed && !sameNumericValue) return false;
  }
  return tryFastTextInput(field, value, page);
}
