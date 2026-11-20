/**
 * Đọc số liên hệ đã cung cấp, giữ cả mã quốc gia và cách trình bày của hồ sơ.
 * @param {object} record Bản ghi có cột điện thoại.
 * @return {string} Số có trong hồ sơ, hoặc chuỗi rỗng khi thiếu.
 * @throws {never} Không tạo số thay thế.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export function getNormalizedPhone(record = {}) {
  return String(record?.phone || record?.phonenumber || record?.cellphone || record?.homephone || record?.workphone || record?.mobile || record?.telephone || '').trim();
}
