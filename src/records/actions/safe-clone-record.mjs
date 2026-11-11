/**
 * Sao chép dữ liệu lead để các phiên không ghi đè bản ghi đang dùng chung.
 * @param {object} record record.
 * @return {*} Kết quả xử lý safe clone record.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function safeCloneRecord(record) {
  if (!record || typeof record !== 'object') return record ?? null;
  try {
    return JSON.parse(JSON.stringify(record));
  } catch {
    return record;
  }
}
