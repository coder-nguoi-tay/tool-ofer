import { normalizeFieldName } from '../normalize-field-name.mjs';

const columnGroups = new Map([
  ['city', 'city'], ['town', 'city'], ['cityname', 'city'],
  ['zipcode', 'zipcode'], ['zip', 'zipcode'], ['postalcode', 'zipcode'], ['postcode', 'zipcode'], ['postal', 'zipcode'],
  ['address', 'address'], ['street', 'address'], ['streetaddress', 'address'], ['address1', 'address'], ['addressline1', 'address'],
]);

/**
 * Chọn cột địa chỉ mà form yêu cầu khi hồ sơ khai nhiều giá trị trong cùng nhóm.
 * @param {string} contact Nghĩa đã xác định cho ô nhập.
 * @param {object} record Hồ sơ đã chuẩn hóa.
 * @param {object} metadata Nhãn và định danh DOM của ô.
 * @param {string[]} candidates Tên ứng viên của caller khi thiếu định danh DOM.
 * @return {object|null} Hồ sơ dùng cho lượt định dạng, hoặc null nếu các định danh chỉ giá trị khác nhau.
 * @throws {never} Cột chưa có giữ cách chọn bí danh của caller.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export function recordForAddressField(contact, record, metadata, candidates = metadata.names || []) {
  if (!record || contact && !columnGroups.has(contact)) return record;
  const label = normalizeFieldName(metadata.accessibleName || metadata.ariaLabelledByText || metadata.ariaLabel || metadata.label);
  const identifiers = [metadata.name, metadata.id].filter(Boolean);
  const hints = columnGroups.has(label) ? [label] : identifiers.length ? identifiers : candidates;
  const columns = hints.map(normalizeFieldName).filter(column => columnGroups.has(column));
  const group = contact || columnGroups.get(columns[0]);
  if (!group || !contact && columns.length !== hints.length) return record;
  if (columns.some(column => columnGroups.get(column) !== group)) return contact ? record : null;
  const values = new Set(columns.map(column => record[column]).filter(Boolean));
  if (values.size > 1) return null;
  const [value] = values;
  return value && value !== record[group] ? { ...record, [group]: value } : record;
}
