import { resolveProvidedFieldValue } from '../autofill/record-values/resolve-provided-field-value.mjs';
import { normalizeFieldName } from '../autofill/normalize-field-name.mjs';

const profileFields = new Set(['firstname', 'lastname', 'fullname', 'email', 'phone', 'address', 'city', 'state', 'zipcode', 'country', 'contact', 'contactmethod', 'preferredcontact', 'language']);

/**
 * Đọc trường hồ sơ hoặc cột đáp án MCP đã được parser CSV/JSON của app chuẩn hóa.
 * @param {object} record Record gắn với grant.
 * @param {string} field Khóa do chủ form công bố.
 * @param {object} session Phiên cung cấp email đã gán và dữ liệu autofill.
 * @return {string|null} Giá trị đủ nguồn hoặc null khi thiếu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export function suppliedValue(record, field, session) {
  if (profileFields.has(field)) {
    const value = resolveProvidedFieldValue({ name: field }, record, session);
    if (value != null && value !== '') return String(value);
  }
  const key = normalizeFieldName('mcp_answer_' + field);
  if (!Object.hasOwn(record, key)) return null;
  const value = record[key];
  return ['string', 'number', 'boolean'].includes(typeof value) && String(value).trim() ? String(value) : null;
}
