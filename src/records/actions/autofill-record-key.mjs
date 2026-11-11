/**
 * Fingerprint ổn định cho một bản ghi autofill (không phụ thuộc thứ tự key).
 * @param {object} record record.
 * @return {*} Kết quả xử lý autofill record key.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function autofillRecordKey(record) {
  return JSON.stringify(Object.fromEntries(Object.entries(record).sort()));
}
