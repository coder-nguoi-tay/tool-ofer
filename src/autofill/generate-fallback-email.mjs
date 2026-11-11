/**
 * Tự động tạo địa chỉ email hợp lệ từ họ tên và số điện thoại khi record thiếu trường email.
 *
 * @param {object} r Bản ghi dữ liệu người dùng.
 * @return {string} Địa chỉ email định dạng name.nameDigits@gmail.com.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function generateFallbackEmail(r = {}) {
  const rawName = r.fullname || `${r.firstname || ''} ${r.lastname || ''}`.trim() || r.userid || '';
  let namePart = 'user.lead';
  if (rawName) {
    const parts = rawName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/);
    if (parts.length >= 2) {
      namePart = `${parts[0]}.${parts.slice(1).join('')}`;
    } else if (parts.length === 1 && parts[0]) {
      namePart = parts[0];
    }
  }
  const digits = (r.phonenumber || r.phone || r.cellphone || r.zipcode || r.zip || '77').replace(/\D/g, '').slice(-4) || '77';
  return `${namePart}${digits}@gmail.com`;
}
export { generateFallbackEmail };
