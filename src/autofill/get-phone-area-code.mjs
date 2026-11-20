import { getNormalizedPhone } from './get-normalized-phone.mjs';

/**
 * Lấy mã vùng do hồ sơ khai báo hoặc tách từ số Bắc Mỹ đủ mười chữ số.
 * @param {object} record Bản ghi có số hoặc mã vùng.
 * @return {string} Ba chữ số mã vùng nếu xác định được.
 * @throws {never} Dữ liệu thiếu trả về chuỗi rỗng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export function getPhoneAreaCode(record = {}) {
  const explicit = String(record?.areacode || record?.phonearea || record?.phone1 || '').trim();
  if (/^\d{3}$/.test(explicit)) return explicit;
  const phone = getNormalizedPhone(record);
  const digits = phone.replace(/\D/g, '');
  if (phone.startsWith('+') && !digits.startsWith('1')) return '';
  return /^(?:1)?(\d{3})\d{7}$/.exec(digits)?.[1] || '';
}
