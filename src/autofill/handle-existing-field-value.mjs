import { markValidFormValue } from './mark-valid-form-value.mjs';
import { resolveContactField } from './resolve-contact-field.mjs';
import { readAddressSelection } from './read-address-selection.mjs';

/**
 * Giữ giá trị đã điền hợp lệ và ghi nhận email sẵn có trên form.
 * @param {object} context Trường hoặc frame đang xử lý cùng dữ liệu và tiến độ của lượt quét.
 * @return {Promise<boolean>} True khi cần bỏ qua trường hiện tại.
 * @throws {Error} Khi không đọc được trạng thái lựa chọn địa chỉ trong frame.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export async function handleExistingFieldValue({
  metadata,
  valueToFill,
  field
}) {
  if (metadata.kind !== 'select' && metadata.value) {
    const contact = resolveContactField(metadata);
    if (contact === 'conflict') return true;
    if (contact === 'address') {
      const choice = await field.evaluate(readAddressSelection, String(valueToFill));
      if (choice.requiresSelection) return choice.retained || choice.pending;
    }
    const currentVal = metadata.value.trim();
    if (currentVal.toLowerCase() === String(valueToFill).trim().toLowerCase()) {
      await field.evaluate(markValidFormValue, metadata.value).catch(() => false);
      return true;
    }
    const isPlaceholderMask = /^(\+1|\+1\s*|\(___\)\s*___-____|___-__-____|[_\-\(\)\s\.\/]+|mm\/dd\/yyyy)$/i.test(currentVal);
    const isInvalidEmail = (contact === 'email' || !contact && metadata.type === 'email') && !currentVal.includes('@');
    const isInvalidZip = contact === 'zipcode' && currentVal.replace(/\D/g, '').length < 5;
    const isFieldInError = metadata.invalid || metadata.classes?.includes('invalid') || metadata.classes?.includes('error');
    if (currentVal !== '' && !isPlaceholderMask && !isInvalidEmail && !isInvalidZip && !isFieldInError) return true;
  }
  return false;
}
