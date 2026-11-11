import { isEmailFieldName } from './is-email-field-name.mjs';

/**
 * Chuẩn hóa độ dài của giá trị theo giới hạn maxLength của ô input nếu có.
 *
 * @param {string} value Giá trị chuỗi đã tìm được.
 * @param {object} metadata Thông tin chi tiết của ô input.
 * @return {string} Giá trị đã điều chỉnh.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function formatMatchedValue(value, metadata = {}) {
  if (value === null || value === undefined) return null;
  let val = String(value).trim();
  const maxLen = Number(metadata.maxLength);
  if (Number.isInteger(maxLen) && maxLen > 0 && val.length > maxLen) {
    const digitsOnly = val.replace(/\D/g, '');
    if (digitsOnly.length === maxLen) {
      val = digitsOnly;
    } else if (digitsOnly.length > maxLen) {
      val = digitsOnly.slice(0, maxLen);
    } else {
      val = val.slice(0, maxLen);
    }
  }

  // Tự động bảo đảm Email luôn có domain hợp lệ (@gmail.com) nếu thiếu ký tự @.
  // FIX "Mailing Address": chỉ coi là email khi metadata.type==='email' HOẶC có candidate
  // thật sự là tên email — và KHÔNG có tên địa chỉ nào khác trong cùng ô,
  // tránh nối @gmail.com vào địa chỉ đường (123 Main Street Apt 4@gmail.com).
  const candidates = metadata.names || [];
  const isAddressName = n => /address|street|addr|apt|suite|unit/i.test(n) && !/e-?mail/i.test(n);
  const addressHints = [...candidates, metadata.name, metadata.id, metadata.placeholder, metadata.ariaLabel, metadata.label];
  const isEmailVal = metadata.type === 'email' || candidates.some(isEmailFieldName) && !addressHints.some(isAddressName);
  if (isEmailVal && val && !val.includes('@')) {
    val = `${val}@gmail.com`;
  }
  return val;
}
export { formatMatchedValue };
