/**
 * Lấy tên, họ hoặc họ tên từ các cột tên của hồ sơ, kể cả hồ sơ chỉ có họ tên gộp.
 * @param {string} contact Loại tên của ô đang điền.
 * @param {object} record Hồ sơ được gán cho form.
 * @return {string|null} Phần tên có trong hồ sơ hoặc null khi thiếu dữ liệu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export function resolveRecordName(contact, record) {
  const first = record.firstname || record.fname;
  const last = record.lastname || record.lname;
  const full = String(record.fullname || record.name || '').trim();
  if (contact === 'fullname') return full || [first, last].filter(Boolean).join(' ') || null;
  const parts = full.split(/\s+/);
  if (contact === 'firstname') return first || parts[0] || null;
  return last || parts.slice(1).join(' ') || null;
}
