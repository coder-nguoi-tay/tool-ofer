/**
 * Lấy tên, họ hoặc họ tên từ các cột tên của hồ sơ, kể cả hồ sơ chỉ có họ tên gộp.
 * @param {string} contact Loại tên của ô đang điền.
 * @param {object} record Hồ sơ được gán cho form.
 * @param {number} [maxLength] Số ký tự tối đa của trường nếu được khai báo.
 * @return {string|null} Tên đầy đủ của trường hoặc null khi thiếu hay vượt giới hạn.
 * @throws {never} Tên thiếu trả về null.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export function resolveRecordName(contact, record, maxLength) {
  const first = record.firstname || record.fname;
  const last = record.lastname || record.lname;
  const full = String(record.fullname || record.name || '').trim();
  const parts = full.split(/\s+/);
  let value;
  if (contact === 'fullname') value = full || [first, last].filter(Boolean).join(' ');
  else if (contact === 'firstname') value = first || parts[0];
  else if (contact === 'lastname') value = last || parts.slice(1).join(' ');
  const name = String(value || '').trim();
  return name && !(maxLength > 0 && name.length > maxLength) ? name : null;
}

/**
 * Phân biệt họ, tên và họ tên theo nhãn người dùng thấy hoặc tên cột khi thiếu nhãn.
 * @param {string} contact Loại trường đã nhận diện từ metadata.
 * @param {object} metadata Nhãn hiển thị, tên và id của trường.
 * @param {string[]} candidates Tên cột dự phòng theo thứ tự của form.
 * @return {string} Loại tên đã xác định hoặc chuỗi rỗng.
 * @throws {never} Bỏ qua nhãn không xác định.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export function getRecordNameKind(contact, metadata, candidates = []) {
  const hint = contact || metadata.accessibleName || metadata.ariaLabelledByText || metadata.ariaLabel
    || metadata.label || metadata.name || metadata.id || candidates[0];
  const key = String(hint || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (/^(?:first(?:name)?|given(?:name)?|fname|fn|forename)$/.test(key)) return 'firstname';
  if (/^(?:last(?:name)?|family(?:name)?|surname|lname|ln)$/.test(key)) return 'lastname';
  if (/^(?:name|fullname|yourname|customername|contactname|applicantfullname)$/.test(key)) return 'fullname';
  return '';
}
