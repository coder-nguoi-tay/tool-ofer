import { getAddressString } from './get-address-string.mjs';
import { getRecordPhoneMask, resolveRecordPhone } from './record-values/resolve-record-phone.mjs';
import { normalizeFieldName } from './normalize-field-name.mjs';

/**
 * Nhận diện từ khóa liên hệ trong cụm Anh–Việt và các ví dụ định dạng trên ô nhập.
 * @param {string} hint Nhãn hoặc định danh của chính control.
 * @return {string} Khóa record, conflict khi nhãn chỉ hai loại dữ liệu, hoặc chuỗi rỗng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
function contactHint(hint) {
  if (!hint) return '';
  const text = String(hint).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
  const example = text.replace(/^(?:e\.g\.|example|vi du|vd)\s*:?\s*/i, '');
  if (/^[\w.+%-]+@[\w.-]+\.[a-z]{2,}$/.test(example)) return 'email';
  if (/^(?:\+?1[ .-]?)?(?:\([\dx#]{3}\)\s*|[\dx#]{3}[ .-])[\dx#]{3}[ .-][\dx#]{4}$/.test(example) ||
      /^(?:0|\+84\s?)[\dx#]{3}[ .-][\dx#]{3}[ .-][\dx#]{3}$/.test(example)) return 'phone';
  if (/^\d+[a-z]?\s+(?:(?:duong|pho)\s+[a-z].*|[a-z][\w .'-]*\s(?:st|rd|ave|blvd|ln|dr|street|road|avenue|boulevard|lane|drive)\.?)$/.test(example)) return 'address';
  const key = normalizeFieldName(text);
  const email = /email|^mail$/.test(key);
  const phone = (/phone|mobile|telephone|contactnumber|dienthoai|^tel(?:national|local|areacode)?$|^cell(number)?$/.test(key) ||
    /\b(?:sdt|so dt)\b/.test(text)) && !/microphone|headphone/.test(key);
  const street = /street|address|diachi|^addr/.test(key.replace(/emailaddress|diachiemail/g, 'email')) ||
    /\b(?:so nha|ten duong|ten pho|duong pho)\b/.test(text);
  if (Number(email) + Number(phone) + Number(street) > 1) return 'conflict';
  if (email) return 'email';
  if (phone) return 'phone';
  // Danh sách thành phần sau địa chỉ mô tả một ô tìm địa chỉ đầy đủ.
  if (/\b(?:street(?: address)?|mailing address|address)\s*,\s*(?:city|town)\s*,\s*(?:state|province)(?:\s*,?\s*(?:zip(?: code)?|postal code))?[.*\s]*$/.test(text)) return 'address';
  if (/addresslevel2|thanhpho|^citytown$/.test(key) || /\b(?:city|town)(?: name| of residence)?[\s:*?]*$/.test(text)) return 'city';
  if (/addresslevel1|^stateorprovince$/.test(key) || /\b(?:state|province)(?: name| abbreviation| of residence)?[\s:*?]*$/.test(text) ||
      /^(?:tinh|tinh\s*\/\s*thanh)\s*\*?$/.test(text)) return 'state';
  if (/zip|postalcode|postcode|mabuuchinh|mabuudien/.test(key) || /\bbuu (?:chinh|dien)\b/.test(text)) return 'zipcode';
  if (/address(line)?2|street(line)?2|^(apt|suite|unit)(number)?$/.test(key) || /\b(?:apartment|apt|suite|unit) (?:number|no)\b/.test(text)) return 'address2';
  if (street) return 'address';
  if (/^(fullname|yourname|hoten|hovaten)$/.test(key) || /\b(?:full name|first (?:name )?(?:and|&) last name|ho (?:va )?ten)\b/.test(text)) return 'fullname';
  if (/^(firstname|givenname|fname|ten)$/.test(key) || /\b(?:(?:first|given) name|ten cua ban)\b/.test(text)) return 'firstname';
  if (/^(lastname|familyname|surname|lname|ho)$/.test(key) || /\b(?:(?:last|family) name|surname|ho cua ban)\b/.test(text)) return 'lastname';
  if (/^(country|countryname|quocgia)$/.test(key) || /\b(?:country|quoc gia)\b/.test(text)) return 'country';
  return '';
}

/**
 * Đối chiếu nhãn và chữ gợi ý cùng ô với autocomplete và kiểu trước khi dùng định danh kỹ thuật.
 * @param {object} metadata Thuộc tính và nhãn do form cung cấp.
 * @return {string} Khóa dữ liệu đã nhận diện, conflict khi không an toàn, hoặc rỗng để dùng matcher cũ.
 * @throws {never} Các dấu hiệu chưa đủ để phân giải được xử lý như xung đột.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export function resolveContactField(metadata) {
  const label = metadata.accessibleName || metadata.ariaLabelledByText || metadata.ariaLabel || metadata.label;
  const labelled = contactHint(label);
  const hinted = contactHint(metadata.placeholder);
  const token = (metadata.autocomplete || '').toLowerCase().trim().split(/\s+/).filter(part => part !== 'webauthn').at(-1);
  if (metadata.type === 'password' || ['one-time-code', 'current-password', 'new-password'].includes(token)) return 'conflict';
  const autocomplete = contactHint(token);
  const fieldName = contactHint(metadata.name);
  const identifiers = [fieldName, contactHint(metadata.id)].filter(Boolean);
  const confirmsLabel = Boolean(labelled && labelled !== 'conflict' &&
    (autocomplete === labelled || fieldName === labelled && identifiers.every(kind => kind === labelled)));
  if (labelled && hinted && labelled !== hinted && !confirmsLabel) return 'conflict';
  let visible = labelled || hinted;
  if (label && metadata.placeholder && (!labelled || !hinted)) {
    const joined = contactHint(label + ' ' + metadata.placeholder);
    // “Address” + “Line 2” và “Họ và” + “Tên” cụ thể hơn từng phần riêng lẻ.
    if (!visible || visible === 'address' && joined === 'address2' || visible === 'firstname' && joined === 'fullname') visible = joined;
  }
  if (visible === 'conflict' || visible && autocomplete && visible !== autocomplete) return 'conflict';
  let kind = visible || autocomplete;
  // Nhãn rõ nghĩa khác (Age, Date of birth...) vẫn thuộc bộ matcher hiện hành.
  if (label && !kind) {
    if (new Set(identifiers).size > 1 || metadata.type === 'tel' && identifiers.includes('address')) return 'conflict';
    return metadata.type === 'email' ? 'email' : '';
  }
  if (!kind && new Set(identifiers).size > 1) return 'conflict';
  if (!kind && metadata.type === 'tel' && ['address', 'email'].includes(identifiers[0])) return 'conflict';
  kind ||= identifiers[0] || '';
  if (kind && ['date', 'time', 'month', 'week', 'datetime-local', 'url'].includes(metadata.type)) return 'conflict';
  if (metadata.type === 'tel' && ['address', 'address2'].includes(kind) && !confirmsLabel) return 'conflict';
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
 * Xác định khi nào có thể sửa giá trị cũ theo đúng trường và hồ sơ của form.
 * @param {string} kind Nghĩa của nhãn đang hiển thị.
 * @param {string} value Giá trị thực đang nằm trong ô.
 * @param {object} record Record hiện tại của form.
 * @param {object} metadata Thuộc tính của ô, gồm mẫu điện thoại nếu có.
 * @param {boolean} markedFilled App đã đánh dấu ô là đã điền.
 * @return {boolean} Giá trị bị đảo trường hoặc số của hồ sơ đang sai định dạng.
 * @throws {never} Giá trị không xác định được nguồn sẽ được giữ nguyên.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export function needsRecordFieldCorrection(kind, value, record, metadata, markedFilled) {
  if (!value || !record) return false;
  if (markedFilled && (kind === 'firstname' || kind === 'lastname')) {
    const first = String(record.firstname || record.fname || '').trim().toLowerCase();
    const last = String(record.lastname || record.lname || '').trim().toLowerCase();
    return Boolean(first && last && first !== last && value.trim().toLowerCase() === (kind === 'firstname' ? last : first));
  }
  if (kind === 'phone' && getRecordPhoneMask(metadata.pattern)) {
    const formatted = resolveRecordPhone(record, kind, metadata);
    if (formatted && value !== formatted && /^[+\d\s().-]+$/.test(value) &&
        value.replace(/\D/g, '') === formatted.replace(/\D/g, '')) return true;
  }
  if (!['phone', 'address'].includes(kind)) return false;
  const address = String(getAddressString(record)).trim().toLowerCase();
  const phone = String(record.phonenumber || record.phone || record.cellphone || record.homephone || record.workphone || '');
  const digits = phone.replace(/\D/g, '');
  if (!address || digits.length < 7) return false;
  const matchesAddress = value.trim().toLowerCase() === address;
  const matchesPhone = /^[+\d\s().-]+$/.test(value) && value.replace(/\D/g, '') === digits;
  return kind === 'phone' ? matchesAddress && !matchesPhone : matchesPhone && !matchesAddress;
}
