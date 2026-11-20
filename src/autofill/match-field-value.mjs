import { getRecordNameKind, resolveRecordName } from './record-values/resolve-record-name.mjs';
import { validateSsnMatch } from './record-values/restrict-profile-field.mjs';
import { resolveRecordPhone } from './record-values/resolve-record-phone.mjs';
import { resolveContactField } from './resolve-contact-field.mjs';
import { formatMatchedValue } from './format-matched-value.mjs';
import { getAddressString } from './get-address-string.mjs';
import { getDobString } from './get-dob-string.mjs';
import { getFallbackCity } from './get-fallback-city.mjs';
import { isEmailFieldName } from './is-email-field-name.mjs';
import { normalizeFieldName } from './normalize-field-name.mjs';
import { parseDobComponents } from './parse-dob-components.mjs';
import { semanticCategories } from './state/semantic-categories.mjs';

/**
 * Tìm giá trị phù hợp trong record cho danh sách tên/nhãn của ô input.
 *
 * @param {string[]} candidateNames Danh sách tên, id, nhãn, placeholder, autocomplete của ô.
 * @param {Record<string, string>} record Bản ghi dữ liệu đã chuẩn hóa tên trường.
 * @param {object} metadata Nhãn, placeholder, ariaLabel và cấu trúc của ô input.
 * @return {string|null} Giá trị cần điền hoặc null nếu không khớp.
 * @throws {never} Nhãn địa chỉ không có dữ liệu phù hợp trả về null, không mượn phone.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
function matchFieldValue(candidateNames, record, metadata = { names: candidateNames }) {
  const contact = resolveContactField(metadata, candidateNames);
  if (contact === 'conflict') return null;
  if (contact.startsWith('ssn')) {
    const matched = matchIdentifiedValue(candidateNames, record, metadata);
    return validateSsnMatch(contact, matched, record, metadata.maxLength);
  }
  if (contact === 'address') return getAddressString(record) || null;
  if (contact === 'address2') return record.address2 || record.apt || record.suite || null;
  const nameKind = getRecordNameKind(contact, metadata, candidateNames);
  if (nameKind) return resolveRecordName(nameKind, record, metadata.maxLength);
  if (/^phone/.test(contact)) return resolveRecordPhone(record, contact, metadata);
  if (contact) {
    return matchIdentifiedValue([contact], record, { type: contact === 'email' ? 'email' : 'text',
      names: [contact], maxLength: metadata.maxLength, kind: metadata.kind, assignedEmail: metadata.assignedEmail });
  }
  return matchIdentifiedValue(candidateNames, record, metadata);
}

/**
 * Đối chiếu nhãn với định danh, giữ thành phần tháng/ngày/năm khi dùng nhãn ngày sinh chung.
 * @param {string[]} candidateNames Tên trường dùng để khớp dữ liệu.
 * @param {object} record Record được gán cho form.
 * @param {object} metadata Thuộc tính định dạng của trường.
 * @return {string|null} Giá trị đã định dạng hoặc null nếu thiếu.
 * @throws {never} Thiếu dữ liệu cho trường đã nhận diện trả về null.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
function matchIdentifiedValue(candidateNames, record, metadata) {
  const accessibleName = metadata.accessibleName || metadata.ariaLabelledByText || metadata.ariaLabel;
  if (accessibleName && accessibleName.length <= 60) {
    const normalizedAccessibleName = normalizeFieldName(accessibleName.replace(/đ/gi, 'd'));
    const category = semanticCategories.find(candidate => candidate.patterns.some(pattern => pattern.test(normalizedAccessibleName)));
    // Nhãn ngày sinh chung không thay thế định danh của từng ô tháng/ngày/năm.
    if (category?.type === 'dob') {
      const identifiers = [metadata.name, metadata.id, metadata.autocomplete].filter(Boolean)
        .map(name => normalizeFieldName(name).replace(/^bday(?=day|month|year)/, 'dob'));
      const components = semanticCategories.filter(candidate => ['dob_month', 'dob_day', 'dob_year'].includes(candidate.type) &&
        identifiers.some(identifier => candidate.patterns.some(pattern => pattern.test(identifier))));
      if (components.length === 1) return formatMatchedValue(components[0].resolve(record, metadata), metadata);
    }
    const splitPhoneField = category?.type === 'phone' && [metadata.name, metadata.id].some(name => /^(areacode|phone[123]|tel[123]|prefix|phoneprefix|linenumber|phoneline)$/i.test(name || ''));
    if (category && normalizedAccessibleName.length <= 40 && !splitPhoneField) {
      // Chạy lại bộ so khớp hiện có với tên nghiệp vụ đã xác minh, bỏ các định danh mâu thuẫn.
      return matchIdentifiedValue([normalizedAccessibleName], record, {
        ...metadata, accessibleName: '', ariaLabelledByText: '', ariaLabel: '', label: '', placeholder: '', name: '', id: '',
        names: [normalizedAccessibleName], type: category.type === 'email' ? 'email' : metadata.type === 'date' && category.type === 'dob' ? 'date' : 'text'
      });
    }
  }
  const visibleHints = [metadata.label, metadata.ariaLabelledByText, metadata.ariaLabel, metadata.placeholder]
    .filter(text => typeof text === 'string' && text.trim() && text.length <= 120)
    .map(text => normalizeFieldName(text.replace(/đ/gi, 'd')));
  const addressHints = visibleHints.filter(hint => !/email/.test(hint) && /address|street|diachi|^addr|^apt|^suite|^unit/.test(hint));
  if (addressHints.length) {
    const addressCategory = semanticCategories.find(category => ['address2', 'address'].includes(category.type) && addressHints.some(hint => category.patterns.some(pattern => pattern.test(hint))))
      || semanticCategories.find(category => category.type === 'address');
    if (addressCategory) return formatMatchedValue(addressCategory.resolve(record, metadata) || null, { ...metadata, type: 'text', names: addressHints });
  }
  // Lọc chỉ giữ các candidate thực sự là tên trường (bỏ các chuỗi văn bản dài > 60 ký tự)
  let normalizedCandidates = candidateNames.filter(n => typeof n === 'string' && n.trim().length > 0 && n.trim().length <= 60).map(normalizeFieldName).filter(n => n.length > 0 && n.length <= 40);

  // Nhận diện rõ ràng các trường phi-phone (Non-Phone) TRƯỚC khi can thiệp phone
  const nameLc = String(metadata.name || '').toLowerCase();
  const idLc = String(metadata.id || '').toLowerCase();
  const placeholderLc = String(metadata.placeholder || '').toLowerCase();
  const ariaLc = String(metadata.ariaLabel || '').toLowerCase();
  const labelLc = String(metadata.label || '').toLowerCase();
  const allText = `${nameLc} ${idLc} ${placeholderLc} ${ariaLc} ${labelLc} ${normalizedCandidates.join(' ')}`;

  // FIX "Mailing Address": "mailing" chứa "mail" nhưng đây là ĐỊA CHỈ, không phải email.
  // Nhận diện địa chỉ chỉ bị triệt tiêu khi text có "email"/"e-mail" nhạt rõ ràng, còn "mailing"/"mail list" không xếp chung ô email.
  const isExplicitAddress = /address|street|addr|apt|suite|unit/.test(allText) && !/e-?mail/.test(allText);
  const isExplicitZip = /zip|postal|postcode|zippost|\bzp\b/.test(allText);
  const isExplicitCity = /city|town|thanhpho/.test(allText);
  const isExplicitState = /\b(state|province|bang|tinh)\b/.test(allText);
  // Ô tuổi (type=tel, maxlength=3) trước đây bị đẩy 'phone' lên đầu nên gõ 3 số đầu của SĐT (vd 814).
  const isExplicitAge = candidateNames.some(n => typeof n === 'string' && /(^|[^a-z])(age|tuoi)([^a-z]|$)/i.test(n) && n.length <= 60);
  const blockPhone = isExplicitAddress || isExplicitZip || isExplicitCity || isExplicitState || isExplicitAge;
  if (blockPhone) normalizedCandidates = normalizedCandidates.filter(candidate => !/phone|mobile|^tel|^cell|^sdt$|dienthoai/.test(candidate));
  if (metadata.type === 'email' && !normalizedCandidates.includes('email')) {
    normalizedCandidates.unshift('email');
  }
  // Chỉ đẩy 'phone' khi KHÔNG phải trường địa chỉ/zip/city/state
  if (metadata.type === 'tel' && !blockPhone && !normalizedCandidates.some(c => c.includes('phone') || c.includes('tel')) && !normalizedCandidates.some(c => /zip|postal|code/i.test(c))) {
    normalizedCandidates.unshift('phone');
  }
  if (normalizedCandidates.some(c => /^(zip|postal|postcode|zippost|zp)$/i.test(c)) && !normalizedCandidates.includes('zipcode')) {
    normalizedCandidates.unshift('zipcode', 'zip');
  }
  if (!normalizedCandidates.length) return null;

  // Email chỉ xác định khi kiểu input là email, hoặc candidate có chữ "email" thật sự,
  // HOẶC candidate là "mail" ĐỘC LẬP mà trường đó KHÔNG phải địa chỉ (zip/address).
  const candidatesEmailName = normalizedCandidates.some(isEmailFieldName);
  const isExplicitEmail = metadata.type === 'email' || normalizedCandidates.some(c => c.includes('email')) || candidatesEmailName && !isExplicitAddress && !isExplicitZip && !allText.includes('address');
  const isEmailField = isExplicitEmail;
  const assignedEmail = metadata.assignedEmail || record.assignedEmail;
  const isExplicitName = normalizedCandidates.some(c => /^(firstname|lastname|fname|lname|fullname|first|last|name|fn|ln)$/i.test(c)) || metadata.name && /firstname|lastname|fname|lname|^fn$|^ln$/i.test(metadata.name) || metadata.id && /firstname|lastname|fname|lname|^fn$|^ln$/i.test(metadata.id);
  const isExplicitDob = normalizedCandidates.some(c => /^(dob|birthdate|dateofbirth|birthday|bday|namsinh|ngaysinh)$/i.test(c));
  const isExplicitNonPhone = isExplicitAddress || isExplicitZip || isExplicitCity || isExplicitState || isExplicitEmail || isExplicitName || isExplicitDob;

  // Ưu tiên 1: nếu là ô email
  if (isExplicitEmail) {
    const assignedEmail = metadata.assignedEmail || record.assignedEmail;
    if (assignedEmail) return formatMatchedValue(assignedEmail, metadata);
    const em = record.email || record.emailaddress || record.mail || record.userid;
    if (em) return formatMatchedValue(em.includes('@') ? em : `${em}@gmail.com`, metadata);
    // Không tự sinh email: chỉ dùng email trong danh sách app cung cấp (hết thì để trống).
    return null;
  }

  // Ưu tiên 2: Địa chỉ đường (Street Address)
  if (isExplicitAddress && !normalizedCandidates.some(c => /address2|apt|suite|unit/i.test(c))) {
    const addr = getAddressString(record) || record.address || record.address1 || record.addressline1 || record.streetaddress || record.street;
    if (addr) return formatMatchedValue(addr, metadata);
  }

  // Ưu tiên 3: Mã bưu chính (Zip Code)
  if (isExplicitZip) {
    const zipVal = record.zipcode || record.zip || record.ziporpostcode || record.ziporpostalcode || record.postalcode || record.postcode || record.postal;
    if (zipVal) {
      const cleanZip = String(zipVal).replace(/\D/g, '');
      const finalZip = cleanZip.length >= 5 ? cleanZip.slice(0, 5) : String(zipVal).trim();
      return formatMatchedValue(finalZip, metadata);
    }
  }

  // Ưu tiên 4: Thành phố (City / Town)
  if (isExplicitCity) {
    let cityVal = record.city || record.town || record.thanhpho || record.cityname || record.shippingcity;
    if (!cityVal) {
      cityVal = getFallbackCity(record.state || record.stateorprovince, record.zipcode || record.zip);
    }
    return formatMatchedValue(cityVal, metadata);
  }

  // Ưu tiên 5: Bang / Tỉnh (State)
  if (isExplicitState) {
    const stateVal = record.state || record.province || record.stateorprovince || record.bang || record.tinh;
    if (stateVal) return formatMatchedValue(stateVal, metadata);
  }

  // Ưu tiên 6: các trường mã vùng hoặc số điện thoại (chỉ khi KHÔNG phải phi-phone và KHÔNG phải địa chỉ/zip/city/state)
  if (blockPhone) {
    // TUYỆT ĐỐI KHÔNG dùng phone cho street/address/zip/postal/city/state
  } else if (!isExplicitNonPhone) {
    const isPhoneAreaField = normalizedCandidates.some(c => /^(areacode|phone1|tel1|phonearea)$/i.test(c));
    if (isPhoneAreaField) {
      return resolveRecordPhone(record, 'phone1', metadata);
    }
    const isPhonePrefixField = normalizedCandidates.some(c => /^(prefix|phone2|tel2|phoneprefix)$/i.test(c));
    if (isPhonePrefixField) {
      return resolveRecordPhone(record, 'phone2', metadata);
    }
    const isPhoneLineField = normalizedCandidates.some(c => /^(line|linenumber|phone3|tel3|phoneline)$/i.test(c));
    if (isPhoneLineField) {
      return resolveRecordPhone(record, 'phone3', metadata);
    }
    const isFullPhoneField = metadata.type === 'tel' && !isExplicitZip && !isExplicitCity && !isExplicitAddress && !isExplicitState && !isExplicitDob && !blockPhone || normalizedCandidates.some(c => /^(phone|phonenumber|telephone|telephone_two|mobile|mobilenumber|cell|cellphone|contactphone|userphone|primaryphone|dayphone|eveningphone|homephone|workphone|sdt|dienthoai|tl)$/i.test(c) || /phone|mobile|cell|^tel(ephone)?(_two)?$|^sdt$|dienthoai|^tl$/i.test(c) && !/^(areacode|phone1|tel1|prefix|phone2|tel2|line|phone3|tel3)$/i.test(c) && !/microphone|headphone|earphone|address|street|addr|apt|suite|unit|zip|postal|postcode|city|town|email|name/i.test(c));
    if (isFullPhoneField) {
      return resolveRecordPhone(record, 'phone', metadata);
    }
  }

  // 1. Kiểm tra khớp chính xác với bất kỳ key nào trong record
  for (const candidate of normalizedCandidates) {
    if (Object.hasOwn(record, candidate) && record[candidate] !== '') {
      if (/^(namsinh|ngaysinh|ngaythangnamsinh|dob|birthdate|dateofbirth|birthday|bday)$/.test(candidate)) {
        // Record dạng tách (birthmonth/birthday/birthyear): "birthday" chỉ là NGÀY trong tháng ("13").
        // Ô ngày sinh đầy đủ phải nhận MM/DD/YYYY ghép từ getDobString; ô 2 ký tự mới là ô ngày riêng.
        if (metadata.maxLength === 2 && /^\d{1,2}$/.test(record[candidate])) return formatMatchedValue(record[candidate], metadata);
        const parsed = parseDobComponents(getDobString(record)) || parseDobComponents(record[candidate]);
        if (parsed) {
          if (metadata.type === 'date') return parsed.isoDob || null;
          if (metadata.maxLength === 4 || metadata.kind === 'select' && !metadata.names?.some(n => /month|day/i.test(n))) {
            return parsed.year;
          }
          return parsed.isoDob ? formatMatchedValue(parsed.usDob, metadata) : null;
        }
        return null;
      }
      return formatMatchedValue(record[candidate], metadata);
    }
  }

  // 2. Tìm kiếm theo từ điển đồng nghĩa (Synonyms / Semantic Categories)
  for (const candidate of normalizedCandidates) {
    for (const cat of semanticCategories) {
      if (cat.patterns.some(pattern => pattern.test(candidate))) {
        if (cat.type === 'phone' && isExplicitNonPhone) continue;
        const val = cat.resolve(record, metadata);
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return formatMatchedValue(String(val), metadata);
        }
      }
    }
  }

  // Bổ sung: nếu candidate có chứa dob (ví dụ applicant_dob, customer_dob)
  for (const candidate of normalizedCandidates) {
    if (candidate.includes('dob') && !candidate.includes('month') && !candidate.includes('day') && !candidate.includes('year')) {
      const parsed = parseDobComponents(getDobString(record));
      if (parsed) {
        if (metadata.type === 'date') return parsed.isoDob;
        return formatMatchedValue(parsed.usDob, metadata);
      }
    }
  }

  // 3. Khớp mờ: nếu tên trường trong record nằm trong candidate hoặc ngược lại (với độ dài >= 4)
  for (const [key, value] of Object.entries(record)) {
    if (/ssn|socialsecurity/.test(normalizeFieldName(key))) continue;
    if (!value || getRecordNameKind(key, {})) continue;
    for (const candidate of normalizedCandidates) {
      if (key.length >= 4 && candidate.includes(key)) return formatMatchedValue(value, metadata);
      if (candidate.length >= 4 && key.includes(candidate)) return formatMatchedValue(value, metadata);
    }
  }

  // 4. Fallback đặc biệt cho Email: nếu form có ô email mà record thiếu hoặc chưa khớp
  if (isEmailField) {
    const em = assignedEmail || record.email || record.emailaddress || record.mail || record.userid;
    if (em) return formatMatchedValue(em.includes('@') ? em : `${em}@gmail.com`, metadata);
    // Không tự sinh email: chỉ dùng email trong danh sách app cung cấp (hết thì để trống).
    return null;
  }

  // 5. Fallback đặc biệt cho Zip Code: nếu form có ô mã bưu chính
  if (normalizedCandidates.some(c => /zip|postal|postcode/.test(c))) {
    const zipVal = record.zipcode || record.zip || record.ziporpostcode || record.ziporpostalcode || record.postalcode || record.postcode || record.postal;
    // Chỉ dùng zip có trong dữ liệu, không tra bảng zip mặc định theo bang.
    if (zipVal) return formatMatchedValue(zipVal, metadata);
    return null;
  }

  // 6. Fallback đặc biệt cho Địa chỉ: nếu form có ô địa chỉ (address, street, streetaddress, address1)
  if (normalizedCandidates.some(c => /address|street|diachi|^addr/i.test(c)) && !normalizedCandidates.some(c => /address2|apt|suite|unit/i.test(c))) {
    const addr = getAddressString(record) || record.address || record.address1 || record.addressline1 || record.streetaddress || record.street;
    // Chỉ dùng dữ liệu đã cung cấp, không tự bịa địa chỉ ngoài record.
    if (addr) return formatMatchedValue(addr, metadata);
    return null;
  }

  // 7. Universal Smart Fallback cho các ô BẮT BUỘC (required): không để ô bắt buộc bị trống khiến form bị nghẽn
  if (metadata.required || metadata.ariaRequired || metadata.isRequired) {
    if (metadata.type === 'number' || metadata.type === 'range') return null;
    if (metadata.type === 'tel') {
      return resolveRecordPhone(record, 'phone', metadata);
    }
    if (metadata.type === 'email') {
      // Không tự sinh email: chỉ dùng email trong danh sách app cung cấp (hết thì để trống).
      return null;
    }
    if (metadata.kind === 'textarea') {
      return null;
    }
    // Ô text bắt buộc không có trong dữ liệu: để trống (không bịa giá trị ngoài record)
    return null;
  }
  return null;
}
export { matchFieldValue };
