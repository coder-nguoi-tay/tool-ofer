import { getAddressString } from './get-address-string.mjs';
import { normalizeFieldName } from './normalize-field-name.mjs';

/**
 * Đọc ý nghĩa liên hệ từ một nhãn; nhận riêng địa chỉ email và phần của số điện thoại.
 * @param {string} hint Nhãn hoặc định danh của chính control.
 * @return {string} Khóa record, conflict khi nhãn chỉ hai loại dữ liệu, hoặc chuỗi rỗng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
function contactHint(hint) {
  const key = normalizeFieldName(String(hint || '').replace(/đ/gi, 'd'));
  const email = /email|^mail$/.test(key);
  const phone = /phone|mobile|telephone|contactnumber|dienthoai|^sdt$|^tel(?:national|local|areacode)?$|^cell(number)?$/.test(key) && !/microphone|headphone/.test(key);
  const street = /street|address|diachi|^addr/.test(key.replace(/emailaddress|diachiemail/g, 'email'));
  if (Number(email) + Number(phone) + Number(street) > 1) return 'conflict';
  if (email) return 'email';
  if (phone) return 'phone';
  if (/addresslevel2|thanhpho|^(city|town|citytown)$/.test(key)) return 'city';
  if (/addresslevel1|^(state|province|stateorprovince)$/.test(key)) return 'state';
  if (/zip|postalcode|postcode|mabuuchinh|mabuudien/.test(key)) return 'zipcode';
  if (/address(line)?2|street(line)?2|^(apt|suite|unit)(number)?$/.test(key)) return 'address2';
  if (street) return 'address';
  if (/^(firstname|givenname|fname|ten)$/.test(key)) return 'firstname';
  if (/^(lastname|familyname|surname|lname|ho)$/.test(key)) return 'lastname';
  if (/^(fullname|yourname|hoten|hovaten)$/.test(key)) return 'fullname';
  if (/^(country|countryname|quocgia)$/.test(key)) return 'country';
  return '';
}

/**
 * Ưu tiên tên truy cập của chính ô, sau đó đến autocomplete, placeholder và định danh kỹ thuật.
 * @param {object} metadata Thuộc tính và nhãn do form cung cấp.
 * @return {string} Khóa dữ liệu đã nhận diện, conflict khi không an toàn, hoặc rỗng để dùng matcher cũ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export function resolveContactField(metadata) {
  const label = metadata.accessibleName || metadata.ariaLabelledByText || metadata.ariaLabel || metadata.label;
  const labelled = contactHint(label);
  const token = (metadata.autocomplete || '').toLowerCase().trim().split(/\s+/).filter(part => part !== 'webauthn').at(-1);
  if (metadata.type === 'password' || ['one-time-code', 'current-password', 'new-password'].includes(token)) return 'conflict';
  const autocomplete = contactHint(token);
  if (labelled && autocomplete && labelled !== autocomplete) return 'conflict';
  // Nhãn rõ nghĩa khác (Age, Date of birth...) vẫn thuộc bộ matcher hiện hành.
  const identifiers = [metadata.name, metadata.id].map(contactHint).filter(Boolean);
  if (label && !labelled && !autocomplete && !contactHint(metadata.placeholder)) {
    if (new Set(identifiers).size > 1 || metadata.type === 'tel' && identifiers.includes('address')) return 'conflict';
    return metadata.type === 'email' ? 'email' : '';
  }
  let kind = labelled || autocomplete || contactHint(metadata.placeholder);
  if (!kind && new Set(identifiers).size > 1) return 'conflict';
  if (!kind && metadata.type === 'tel' && ['address', 'email'].includes(identifiers[0])) return 'conflict';
  kind ||= identifiers[0] || '';
  if (kind && ['date', 'time', 'month', 'week', 'datetime-local', 'url'].includes(metadata.type)) return 'conflict';
  if (metadata.type === 'number' && ['address', 'address2', 'email'].includes(kind)) return 'conflict';
  if (metadata.type === 'email' && kind && kind !== 'email') return 'conflict';
  if (!kind && metadata.type === 'email') return 'email';
  if (kind === 'phone') {
    const split = [metadata.name, metadata.id, metadata.autocomplete].map(name => normalizeFieldName(String(name || '')));
    if (split.some(name => /^(phone1|tel1|areacode|phonearea|telareacode)$/.test(name))) return 'phone1';
    if (split.some(name => /^(phone2|tel2|prefix|phoneprefix|tellocalprefix)$/.test(name))) return 'phone2';
    if (split.some(name => /^(phone3|tel3|linenumber|phoneline|tellocalsuffix)$/.test(name))) return 'phone3';
  }
  return kind;
}

/**
 * Nhận ra dữ liệu điện thoại và địa chỉ đã bị điền đảo từ cùng record.
 * @param {string} kind Nghĩa của nhãn đang hiển thị.
 * @param {string} value Giá trị thực đang nằm trong ô.
 * @param {object} record Record hiện tại của form.
 * @return {boolean} Giá trị trùng trường đối diện và khác trường đúng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export function isSwappedContactValue(kind, value, record) {
  if (!value || !record || !['phone', 'address'].includes(kind)) return false;
  const address = String(getAddressString(record)).trim().toLowerCase();
  const phone = String(record.phonenumber || record.phone || record.cellphone || record.homephone || record.workphone || '');
  const digits = phone.replace(/\D/g, '');
  if (!address || digits.length < 7) return false;
  const matchesAddress = value.trim().toLowerCase() === address;
  const matchesPhone = /^[+\d\s().-]+$/.test(value) && value.replace(/\D/g, '') === digits;
  return kind === 'phone' ? matchesAddress && !matchesPhone : matchesPhone && !matchesAddress;
}
