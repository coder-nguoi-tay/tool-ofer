import { getAddressString } from '../get-address-string.mjs';
import { getDobString } from '../get-dob-string.mjs';
import { parseDobComponents } from '../parse-dob-components.mjs';

/**
 * Chuẩn hóa dữ liệu liên hệ của record cho subform Twy.
 * @param {object} record Record phiên hiện tại.
 * @return {object} Dữ liệu tên, địa chỉ và liên hệ theo field type của widget.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function buildTwyContactValues(record) {
  const parsedDob = parseDobComponents(getDobString(record));
  const personName = String(record.fullname || '').trim();
  const [firstPart = '', ...restParts] = personName.split(' ');
  const lastPart = restParts.join(' ');
  const dobText = parsedDob ? `${parsedDob.month}/${parsedDob.day}/${parsedDob.year}` : '';
  return {
    first: String(record.firstname || firstPart || '').trim(),
    last: String(record.lastname || lastPart || '').trim(),
    email: String(record.email || record.mail || record.emailaddress || '').trim(),
    zip: String(record.zipcode || record.zip || record.postalcode || '').trim(),
    phone: String(record.phonenumber || record.phone || record.cellphone || '').trim(),
    dob: dobText,
    address: String(getAddressString(record)),
    city: String(record.city || record.town || ''),
    state: String(record.state || record.province || '')
  };
}
