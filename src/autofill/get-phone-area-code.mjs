import { DEFAULT_PHONE_AREA_CODES } from './state/default-phone-area-codes.mjs';

/**
 * Lấy mã vùng điện thoại (Area Code - 3 số đầu) mặc định đầu 814 hoặc 817.
 * Nếu số điện thoại của bản ghi đã có đầu 814 hoặc 817 thì giữ nguyên;
 * ngược lại (hoặc nếu thiếu), tự động gán mặc định đầu 814 hoặc 817 nhất quán cho từng bản ghi.
 *
 * @param {object} record Bản ghi dữ liệu người dùng.
 * @return {string} Mã vùng '814' hoặc '817'.
 * @throws {never} Giá trị record sai định dạng được xử lý như số còn thiếu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function getPhoneAreaCode(record = {}) {
  if (record && typeof record === 'object') {
    if (record.__phoneAreaCode && DEFAULT_PHONE_AREA_CODES.includes(String(record.__phoneAreaCode))) {
      return String(record.__phoneAreaCode);
    }
    const explicitArea = String(record.areacode || record.phonearea || record.phone1 || '').replace(/\D/g, '');
    if (DEFAULT_PHONE_AREA_CODES.includes(explicitArea)) {
      record.__phoneAreaCode = explicitArea;
      return explicitArea;
    }
  }
  const raw = String(record?.phonenumber || record?.phone || record?.cellphone || record?.homephone || record?.workphone || '').replace(/\D/g, '');
  const nationalNumber = raw.length === 11 && raw.startsWith('1') ? raw.slice(1) : raw;
  if (nationalNumber.startsWith('814')) {
    if (record && typeof record === 'object') record.__phoneAreaCode = '814';
    return '814';
  }
  if (nationalNumber.startsWith('817')) {
    if (record && typeof record === 'object') record.__phoneAreaCode = '817';
    return '817';
  }

  // Số điện thoại có sẵn nhưng không có đầu vùng 814/817: chuẩn hóa về 814 hoặc 817
  // (không phải bịa từ bên ngoài — số điện thoại đã có trong dữ liệu, chỉ cần mã vùng hợp lệ).
  const seed = String(record?.id || record?.email || record?.fullname || record?.firstname || record?.lastname || raw || '');
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = hash * 31 + seed.charCodeAt(i) >>> 0;
  }
  const chosen = DEFAULT_PHONE_AREA_CODES[hash % DEFAULT_PHONE_AREA_CODES.length];
  if (record && typeof record === 'object') {
    record.__phoneAreaCode = chosen;
  }
  return chosen;
}
export { getPhoneAreaCode };
