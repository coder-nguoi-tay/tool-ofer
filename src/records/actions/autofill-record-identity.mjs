import { autofillRecordKey } from './autofill-record-key.mjs';

/**
 * Định danh record bỏ qua các trường email (email do hàng đợi email gán thêm vào record).
 * @param {object} record record.
 * @return {*} Kết quả xử lý autofill record identity.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function autofillRecordIdentity(record = {}) {
  const rest = Object.fromEntries(Object.entries(record).filter(([k]) => !/^(email|emailaddress|mail|assignedemail)$/i.test(k)));
  return autofillRecordKey(rest);
}
