import { getAddressString } from '../get-address-string.mjs';
import { getDobString } from '../get-dob-string.mjs';
import { getNormalizedPhone } from '../get-normalized-phone.mjs';
import { matchFieldValue } from '../match-field-value.mjs';
import { resolveRecordCity } from './resolve-record-city.mjs';

/**
 * Giải giá trị repair từ record/alias và quy tắc đã có; không tạo email, tên, địa chỉ hay giá trị field lạ.
 * @param {object} metadata Nhãn, tên, id, type của field thật trong DOM.
 * @param {object} record Dữ liệu được cung cấp cho phiên.
 * @param {object} session Email đã được gán cho phiên.
 * @return {string|null} Giá trị có nguồn dữ liệu, hoặc null để giữ field chưa hoàn tất.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function resolveProvidedFieldValue(metadata, record = {}, session = {}) {
  const names = [...(metadata.names || []), metadata.name, metadata.id, metadata.placeholder, metadata.label, metadata.type].filter(Boolean);
  const identity = names.join(' ').toLowerCase();
  if (/e-?mail|\bmail\b/.test(identity) && !/mailing address/.test(identity)) {
    const email = session.assignedEmail || record.assignedEmail || record.email || record.emailaddress || record.mail;
    return email && String(email).includes('@') ? String(email) : null;
  }
  if (/city|town|address-level2/.test(identity)) return resolveRecordCity(record) || null;
  if (/zip|postal|postcode/.test(identity)) return String(record.zipcode || record.zip || record.postalcode || record.postcode || '') || null;
  if (/address|street|\baddr\b/.test(identity) && !/address2|street2|suite|unit|apt/.test(identity)) return getAddressString(record) || null;
  const fullname = String(record.fullname || record.name || '').trim();
  if (/first|given|\bfname\b|\bfn\b/.test(identity)) return record.firstname || record.fname || fullname.split(/\s+/)[0] || null;
  if (/last|family|surname|\blname\b|\bln\b/.test(identity)) return record.lastname || record.lname || fullname.split(/\s+/).slice(1).join(' ') || null;
  if (/full.?name|\bname\b/.test(identity) && !/user|company|bank|card|street|city|state/.test(identity)) return fullname || `${record.firstname || ''} ${record.lastname || ''}`.trim() || null;
  if (/phone|telephone|mobile|cell|\btel\b/.test(identity) && !/headphone|microphone/.test(identity)) {
    const raw = record.phone || record.phonenumber || record.cellphone || record.homephone || record.workphone;
    return raw && String(raw).replace(/\D/g,'').length >= 7 ? getNormalizedPhone(record) : null;
  }
  if (/birth|dob|\bmonth\b|\bday\b|\byear\b|\bage\b/.test(identity)) {
    if (!getDobString(record) && !record.age && !record.birthyear) return null;
    return matchFieldValue(names, record, { ...metadata, required: false, ariaRequired: false, isRequired: false });
  }
  if (/title|salutation|honorific/.test(identity) && (record.title || record.gender || record.sex)) return matchFieldValue(names,record,{...metadata,required:false});
  if (/state|province/.test(identity)) return record.state || record.province || record.stateorprovince || null;
  if (/gender|\bsex\b/.test(identity)) return record.gender || record.sex || null;
  if (/country/.test(identity)) return record.country || null;
  for (const name of names) {
    const normalized = String(name).toLowerCase().replace(/[^a-z0-9]/g,'');
    const key = Object.keys(record).find(key => !key.startsWith('__') && key.toLowerCase().replace(/[^a-z0-9]/g,'') === normalized);
    if (key && record[key] !== '') return String(record[key]);
  }
  return null;
}
