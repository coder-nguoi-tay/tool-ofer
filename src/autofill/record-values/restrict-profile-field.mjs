import { normalizeFieldName } from '../normalize-field-name.mjs';

const ssnFieldKinds = new Map([
  ['ssn', 'ssn'], ['socialsecurity', 'ssn'], ['socialsecuritynumber', 'ssn'],
  ['ssn1', 'ssn1'], ['ssn2', 'ssn2'], ['ssn3', 'ssn3'], ['ssn4', 'ssn3'],
  ['ssnlast4', 'ssn3'], ['last4digitsofssn', 'ssn3'],
]);
const verificationField = /(?:verification|confirmation|authentication|security|sms|verify)code|onetime(?:code|password|passcode)|(?:^otp|otp$)|(?:code|pin)(?:we|thatwe|was)?(?:sent|texted|emailed)|maxac(?:minh|thuc)/;
const otherPerson = /emergencycontact|nextofkin|child|dependent|spouse|guardian|parent|beneficiary|reference|coapplicant|employer|mother|father|nguoilienhekhan|cua(?:con|nguoithan|vo|chong)/;
const personalDetail = /name|phone|email|address|birth|dob|ssn|socialsecurity|hoten|ngaysinh|dienthoai|diachi/;

/**
 * Chặn lấy dữ liệu hồ sơ cho mã xác minh, người khác hoặc ô định danh mơ hồ.
 * @param {object} metadata Nhãn của đúng control và các định danh trong DOM.
 * @param {string[]} candidates Tên bổ sung do bộ đối sánh hiện tại cung cấp.
 * @return {string} conflict, loại ô SSN có thể kiểm chứng, hoặc rỗng cho trường thông thường.
 * @throws {never} Bằng chứng mâu thuẫn được coi là conflict.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export function restrictProfileField(metadata, candidates = metadata.names || []) {
  const labels = [metadata.accessibleName, metadata.ariaLabelledByText, metadata.ariaLabel, metadata.label].filter(Boolean);
  const descriptions = [...labels, metadata.name, metadata.id, metadata.placeholder, metadata.autocomplete, ...candidates].filter(Boolean);
  if (descriptions.some(text => /\botp\b/i.test(text))) return 'conflict';
  const hints = descriptions.map(normalizeFieldName);
  if (hints.some(hint => verificationField.test(hint)) ||
      hints.some(hint => otherPerson.test(hint)) && hints.some(hint => personalDetail.test(hint))) return 'conflict';
  if (!hints.some(hint => /ssn|socialsecurity|^social$|last(?:4|four)|(?:4|bon)(?:chuso|so)cuoi/.test(hint))) return '';
  const kinds = new Set(hints.map(hint => ssnFieldKinds.get(hint)).filter(Boolean));
  if (kinds.size !== 1) return 'conflict';
  const [kind] = kinds;
  if (labels.some(label => ssnFieldKinds.get(normalizeFieldName(label)) !== kind)) return 'conflict';
  if (/\p{L}/u.test(metadata.placeholder || '') && ssnFieldKinds.get(normalizeFieldName(metadata.placeholder)) !== kind) return 'conflict';
  if (metadata.type && !['text', 'number', 'tel'].includes(metadata.type)) return 'conflict';
  if (metadata.autocomplete && !/^(?:on|off)$/i.test(metadata.autocomplete)) return 'conflict';
  if (hints.some(hint => /(?:card|account|phone|bank|email)/.test(hint))) return 'conflict';
  if (kind !== 'ssn3' && hints.some(hint => /last(?:4|four)/.test(hint))) return 'conflict';
  return kind;
}

/**
 * Giữ kết quả đối sánh SSN cũ chỉ khi đúng phần, đúng nguồn và vừa với giới hạn control.
 * @param {string} kind Loại trường SSN đã kiểm tra.
 * @param {string|null} matched Giá trị mà bộ đối sánh định dùng.
 * @param {object} record Hồ sơ nguồn.
 * @param {number} [maxLength] Giới hạn ký tự của control.
 * @return {string|null} Giá trị ban đầu hoặc null để giữ nguyên ô.
 * @throws {never} Dữ liệu nguồn không hợp lệ không được dùng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export function validateSsnMatch(kind, matched, record = {}, maxLength) {
  if (!matched || (maxLength > 0 && matched.length > maxLength)) return null;
  const source = String(record.ssn || record.socialsecurity || '');
  const validFull = /^(?:\d{9}|\d{3}-\d{2}-\d{4})$/.test(source);
  if (kind === 'ssn') return validFull && matched === source ? matched : null;
  if (validFull) {
    const digits = source.replaceAll('-', '');
    const parts = { ssn1: digits.slice(0, 3), ssn2: digits.slice(3, 5), ssn3: digits.slice(5) };
    return matched === parts[kind] ? matched : null;
  }
  const suffix = String(record.ssn_last4 || record.ssnlast4 || '');
  return kind === 'ssn3' && /^\d{4}$/.test(suffix) && matched === suffix ? matched : null;
}
