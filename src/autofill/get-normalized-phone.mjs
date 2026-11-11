import { getPhoneAreaCode } from './get-phone-area-code.mjs';
import { randomInt } from 'node:crypto';

/**
 * Chuẩn hóa số điện thoại 10 chữ số của Hoa Kỳ luôn có mã vùng mặc định là 814 hoặc 817.
 * Bảo toàn định dạng ban đầu (dấu gạch nối '-', ngoặc đơn '()') nếu số gốc có định dạng.
 *
 * @param {object} record Bản ghi dữ liệu người dùng.
 * @return {string} Số điện thoại đã chuẩn hóa với đầu số 814 hoặc 817.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function getNormalizedPhone(record = {}) {
  const areaCode = getPhoneAreaCode(record);
  const raw = String(record?.phonenumber || record?.phone || record?.cellphone || record?.homephone || record?.workphone || '').trim();
  const digits = raw.replace(/\D/g, '');

  // Thiếu số hoặc số quá ngắn: giữ đầu số 814/817, 7 số đuôi sinh ngẫu nhiên một lần cho mỗi bản ghi
  // (không dùng số cứng; lưu vào __phoneSuffix để các ô phone/prefix/line trong phiên nhất quán).
  if (digits.length < 7) {
    let suffix = record && typeof record === 'object' ? record.__phoneSuffix : null;
    if (!/^\d{7}$/.test(String(suffix || ''))) {
      suffix = `${randomInt(2, 10)}${String(randomInt(0, 1000000)).padStart(6, '0')}`;
      if (record && typeof record === 'object') record.__phoneSuffix = suffix;
    }
    return `${areaCode}${suffix}`;
  }

  // Lấy 7 chữ số cuối (3 số prefix + 4 số line number)
  const last7 = digits.length >= 10 ? digits.slice(-7) : digits.padStart(7, '9').slice(-7);

  // Giữ nguyên kiểu định dạng hiển thị của số gốc
  if (/^\(\d{3}\)\s*\d{3}-\d{4}$/.test(raw)) {
    return `(${areaCode}) ${last7.slice(0, 3)}-${last7.slice(3)}`;
  }
  if (/^\d{3}-\d{3}-\d{4}$/.test(raw)) {
    return `${areaCode}-${last7.slice(0, 3)}-${last7.slice(3)}`;
  }
  if (/^\d{3}\.\d{3}\.\d{4}$/.test(raw)) {
    return `${areaCode}.${last7.slice(0, 3)}.${last7.slice(3)}`;
  }

  // Mặc định 10 chữ số liền nhau
  return `${areaCode}${last7}`;
}
export { getNormalizedPhone };
