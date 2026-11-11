/**
 * Giữ giá trị đã điền hợp lệ và ghi nhận email sẵn có trên form.
 * @param {object} context Trường hoặc frame đang xử lý cùng dữ liệu và tiến độ của lượt quét.
 * @return {Promise<boolean>} True khi cần bỏ qua trường hiện tại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleExistingFieldValue({
  metadata,
  valueToFill,
  field
}) {
  if (metadata.kind !== 'select' && metadata.value) {
    const currentVal = metadata.value.trim();
    if (currentVal.toLowerCase() === String(valueToFill).trim().toLowerCase()) {
      await field.evaluate(el => {
        el.dataset.uxFilled = '1';
        el.classList.remove('invalid', 'error');
        el.classList.add('valid', 'has-value');
        const parent = el.closest('.field-item, .form-group, .input-group, .loco-group');
        if (parent) {
          parent.classList.remove('invalid', 'error');
          parent.classList.add('valid', 'non-empty');
          const err = parent.querySelector('.error-entry, .error');
          if (err) err.style.display = 'none';
        }
      }).catch(() => {});
      return true;
    }
    const isPlaceholderMask = /^(\+1|\+1\s*|\(___\)\s*___-____|___-__-____|[_\-\(\)\s\.\/]+|mm\/dd\/yyyy)$/i.test(currentVal);
    const isInvalidEmail = (metadata.type === 'email' || metadata.names?.some(n => /email|mail/i.test(n))) && !currentVal.includes('@');
    const isInvalidZip = metadata.names?.some(n => /zip|postal|postcode/i.test(n)) && currentVal.replace(/\D/g, '').length < 5;
    const isFieldInError = metadata.classes?.includes('invalid') || metadata.classes?.includes('error');
    if (currentVal !== '' && !isPlaceholderMask && !isInvalidEmail && !isInvalidZip && !isFieldInError) return true;
  }
  return false;
}
