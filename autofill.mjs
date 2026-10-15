import { randomInt } from 'node:crypto';

/**
 * Đọc dữ liệu CSV hoặc JSON để mỗi form có thể chọn một bản ghi.
 * Hỗ trợ mọi trường dữ liệu (họ tên, địa chỉ, sđt, ngày sinh, email, SSN, bank, routing...).
 * Tự động phục hồi nếu JSON bị cắt cụt đuôi hoặc chứa trailing comma.
 *
 * @param {string} source Nội dung người dùng dán vào ô dữ liệu.
 * @return {object[]} Các bản ghi có tên cột và giá trị dạng chuỗi.
 * @throws {Error} Khi cấu trúc hoặc số lượng dữ liệu không hợp lệ.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
export function parseAutofillRecords(source) {
  const content = String(source ?? '').trim();
  if (!content) return [];
  if (content.includes('\t')) throw new Error('Hãy dùng CSV hoặc JSON; bảng phân tách bằng tab chưa được hỗ trợ.');

  let records;
  const trimmedJson = content.replace(/,\s*$/, '').trim();
  if (trimmedJson.startsWith('[') || trimmedJson.startsWith('{')) {
    const tryCleanJson = (str) => {
      const cleaned = str
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/,\s*$/, '');
      return JSON.parse(cleaned);
    };

    try {
      const parsed = tryCleanJson(trimmedJson);
      records = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      // 1. Thử bọc trong mảng [ ... ] nếu người dùng dán một hoặc nhiều object không có ngoặc vuông ngoài cùng
      try {
        const wrapped = `[\n${trimmedJson.replace(/,\s*$/, '')}\n]`;
        const parsed = tryCleanJson(wrapped);
        records = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        // 2. Tự phục hồi mảng hoặc chuỗi JSON bị cắt cụt đuôi: cắt về dấu '}' hoàn chỉnh cuối cùng
        const lastBraceIndex = trimmedJson.lastIndexOf('}');
        if (lastBraceIndex !== -1) {
          try {
            const firstBraceIndex = trimmedJson.indexOf('{');
            const subStr = trimmedJson.slice(firstBraceIndex !== -1 ? firstBraceIndex : 0, lastBraceIndex + 1).replace(/,\s*$/, '');
            const candidate = subStr.startsWith('[') ? `${subStr}\n]` : `[\n${subStr}\n]`;
            const parsed = tryCleanJson(candidate);
            records = Array.isArray(parsed) ? parsed : [parsed];
          } catch {
            throw new Error('Dữ liệu JSON không hợp lệ.');
          }
        } else {
          throw new Error('Dữ liệu JSON không hợp lệ.');
        }
      }
    }
  } else {
    const rows = [];
    let row = [];
    let value = '';
    let quoted = false;
    for (let index = 0; index < content.length; index += 1) {
      const character = content[index];
      if (character === '"') {
        if (quoted && content[index + 1] === '"') {
          value += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (character === ',' && !quoted) {
        row.push(value);
        value = '';
      } else if ((character === '\n' || character === '\r') && !quoted) {
        row.push(value);
        if (row.some((cell) => cell.trim())) rows.push(row);
        row = [];
        value = '';
        if (character === '\r' && content[index + 1] === '\n') index += 1;
      } else {
        value += character;
      }
    }
    if (quoted) throw new Error('CSV có dấu nháy kép chưa đóng.');
    row.push(value);
    if (row.some((cell) => cell.trim())) rows.push(row);
    const headers = rows.shift()?.map((header) => header.trim().replace(/^\uFEFF/, ''));
    if (!headers?.length || !rows.length) throw new Error('CSV cần hàng tiêu đề và ít nhất một bản ghi.');
    records = rows.map((cells) => {
      if (cells.length !== headers.length) throw new Error('CSV có dòng không cùng số cột với tiêu đề.');
      return Object.fromEntries(headers.map((header, index) => [header, cells[index]]));
    });
  }

  if (!Array.isArray(records) || !records.length) {
    throw new Error('Dữ liệu tự điền cần ít nhất một bản ghi.');
  }

  const allHeaders = new Set();
  for (const record of records) {
    if (record && typeof record === 'object' && !Array.isArray(record)) {
      for (const key of Object.keys(record)) {
        if (key.trim()) allHeaders.add(key.trim());
      }
    }
  }
  const headers = [...allHeaders];
  if (!headers.length) {
    throw new Error('Dữ liệu tự điền cần ít nhất một tên cột hợp lệ.');
  }
  const normalizedHeaders = headers.map(normalizeFieldName);
  if (new Set(normalizedHeaders).size !== headers.length || normalizedHeaders.includes('')) {
    throw new Error('Tên cột tự điền bị trùng hoặc không hợp lệ.');
  }

  return records.map((record) => {
    if (!record || Array.isArray(record) || typeof record !== 'object') {
      throw new Error('Mỗi bản ghi phải là một đối tượng dữ liệu.');
    }
    const normalized = Object.fromEntries(headers.map((header) => {
      const value = record[header] ?? '';
      if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) {
        throw new Error('Giá trị tự điền phải là chữ, số hoặc true/false.');
      }
      return [normalizeFieldName(header), String(value ?? '').trim()];
    }));

    // Tự động làm giàu các trường (Enrichment) để tương thích tối đa với mọi mẫu form:
    // 1. Ngày sinh gộp (DOB): nếu có birthyear và birthmonth
    if (normalized.birthyear && normalized.birthmonth) {
      const mm = String(normalized.birthmonth).padStart(2, '0');
      const dd = String(normalized.birthday || '1').padStart(2, '0');
      const yyyy = String(normalized.birthyear);
      normalized.dob = `${mm}/${dd}/${yyyy}`;
      normalized.dateofbirth = normalized.dob;
      normalized.birthdate = normalized.dob;
      if (!normalized.age) {
        const yr = parseInt(yyyy, 10);
        if (!Number.isNaN(yr)) normalized.age = String(new Date().getFullYear() - yr);
      }
    }

    // 2. Email: tự động bổ sung @gmail.com nếu thiếu ký tự @ (tránh lỗi HTML5 email validation)
    if (normalized.email && !normalized.email.includes('@')) {
      normalized.email = `${normalized.email}@gmail.com`;
    } else if (!normalized.email) {
      normalized.email = generateFallbackEmail(normalized);
    }

    // 2.5. Mã bưu điện (Zip / Postal Code): map đầy đủ mọi biến thể tên cột
    const resolvedZip = normalized.zipcode || normalized.zip || normalized.ziporpostcode || normalized.ziporpostalcode || normalized.postalcode || normalized.postcode || normalized.postal || normalized.mabuudien;
    if (resolvedZip) {
      normalized.zipcode = resolvedZip;
      normalized.zip = resolvedZip;
      normalized.postalcode = resolvedZip;
      normalized.ziporpostcode = resolvedZip;
    }

    // 3. Bang / Tỉnh (State Or Province)
    if (!normalized.state && normalized.stateorprovince) {
      normalized.state = normalized.stateorprovince;
    }

    // 4. Địa chỉ (Address Line 1 / Street / Street Address)
    const resolvedAddress = normalized.address || normalized.addressline1 || normalized.address1 || normalized.streetaddress || normalized.street || normalized.addressline || normalized.addr || normalized.homeaddress || normalized.streetaddr || '';
    if (resolvedAddress) {
      normalized.address = resolvedAddress;
      normalized.addressline1 = resolvedAddress;
      normalized.address1 = resolvedAddress;
      normalized.streetaddress = resolvedAddress;
      normalized.street = resolvedAddress;
    }

    // 5. Số điện thoại (Phone, Home Phone, Cell Phone)
    if (!normalized.phone) {
      normalized.phone = normalized.cellphone || normalized.homephone || normalized.workphone || '';
    }

    // 6. Họ tên gộp
    if (!normalized.fullname && normalized.firstname && normalized.lastname) {
      normalized.fullname = `${normalized.firstname} ${normalized.lastname}`.trim();
    }

    // 7. Thẻ thanh toán (Credit / Debit Card)
    if (normalized.cardexpiresmonth && !normalized.cardexpmonth) {
      normalized.cardexpmonth = normalized.cardexpiresmonth;
    }
    if (normalized.cardexpiresyear && !normalized.cardexpyear) {
      normalized.cardexpyear = normalized.cardexpiresyear;
    }
    if (normalized.cardvalidationcode && !normalized.cvv) {
      normalized.cvv = normalized.cardvalidationcode;
      normalized.cvc = normalized.cardvalidationcode;
    }
    if (normalized.cardnumber && !normalized.creditcard) {
      normalized.creditcard = normalized.cardnumber;
    }

    return normalized;
  });
}

/**
 * Chuẩn hóa tên cột và nhãn trên form để ghép đúng trường.
 *
 * @param {string} name Tên cột hoặc nhãn trường.
 * @return {string} Tên so khớp không dấu và không ký tự phân cách.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
export function normalizeFieldName(name) {
  return String(name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Tự động tạo địa chỉ email hợp lệ từ họ tên và số điện thoại khi record thiếu trường email.
 *
 * @param {object} r Bản ghi dữ liệu người dùng.
 * @return {string} Địa chỉ email định dạng name.nameDigits@gmail.com.
 */
export function generateFallbackEmail(r = {}) {
  const rawName = r.fullname || `${r.firstname || ''} ${r.lastname || ''}`.trim() || r.userid || '';
  let namePart = 'user.lead';
  if (rawName) {
    const parts = rawName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/);
    if (parts.length >= 2) {
      namePart = `${parts[0]}.${parts.slice(1).join('')}`;
    } else if (parts.length === 1 && parts[0]) {
      namePart = parts[0];
    }
  }
  const digits = (r.phonenumber || r.phone || r.cellphone || r.zipcode || r.zip || '77').replace(/\D/g, '').slice(-4) || '77';
  return `${namePart}${digits}@gmail.com`;
}

/**
 * Bảng mã viết tắt và tên đầy đủ của 50 bang Hoa Kỳ.
 */
export const usStateNames = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia',
};
export const usStateCodes = Object.fromEntries(
  Object.entries(usStateNames).map(([code, name]) => [name.toLowerCase(), code]),
);

/**
 * Tách và chuẩn hóa các thành phần của ngày sinh (ngày, tháng, năm).
 * Hỗ trợ các định dạng: M/D/YYYY (8/18/1967), MM/DD/YYYY, YYYY-MM-DD, DD/MM/YYYY.
 *
 * @param {string} dobStr Chuỗi ngày sinh từ dữ liệu người dùng.
 * @return {object|null} Đối tượng chứa các định dạng ngày/tháng/năm hoặc null.
 */
export function parseDobComponents(dobStr) {
  const str = String(dobStr ?? '').trim();
  if (!str) return null;

  let month = null;
  let day = null;
  let year = null;

  // 1. ISO YYYY-MM-DD hoặc YYYY/MM/DD
  let match = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (match) {
    year = match[1];
    month = match[2];
    day = match[3];
  } else {
    // 2. M/D/YYYY hoặc MM/DD/YYYY hoặc D/M/YYYY (e.g. 8/18/1967)
    match = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
    if (match) {
      const p1 = Number(match[1]);
      const p2 = Number(match[2]);
      year = match[3];
      // Nếu p1 > 12 thì p1 chắc chắn là ngày (DD/MM/YYYY)
      if (p1 > 12 && p2 <= 12) {
        day = String(p1);
        month = String(p2);
      } else {
        // Mặc định chuẩn US MM/DD/YYYY (8/18/1967 -> tháng 8, ngày 18)
        month = String(p1);
        day = String(p2);
      }
    } else {
      // 3. Chỉ có năm 4 chữ số
      match = str.match(/(\d{4})/);
      if (match) {
        year = match[1];
      }
    }
  }

  if (!year && !month && !day) return null;

  const monthNum = month ? Number(month) : null;
  const dayNum = day ? Number(day) : null;

  const monthNames = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const shortMonthNames = [
    '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  const monthStr = monthNum ? String(monthNum) : '';
  const monthPad = monthNum ? String(monthNum).padStart(2, '0') : '';
  const monthName = monthNum && monthNames[monthNum] ? monthNames[monthNum] : '';
  const shortMonth = monthNum && shortMonthNames[monthNum] ? shortMonthNames[monthNum] : '';

  const dayStr = dayNum ? String(dayNum) : '';
  const dayPad = dayNum ? String(dayNum).padStart(2, '0') : '';

  const fullYear = year ? String(year) : '';
  const shortYear = year && year.length === 4 ? year.slice(-2) : '';

  // Định dạng US đầy đủ: MM/DD/YYYY (ví dụ: 08/18/1967)
  const usDob = (monthPad && dayPad && fullYear) ? `${monthPad}/${dayPad}/${fullYear}` : str;
  // Định dạng ISO: YYYY-MM-DD (dành riêng cho HTML5 <input type="date">)
  const isoDob = (fullYear && monthPad && dayPad) ? `${fullYear}-${monthPad}-${dayPad}` : '';

  return {
    year: fullYear,
    shortYear,
    month: monthStr,
    monthPad,
    monthName,
    shortMonth,
    day: dayStr,
    dayPad,
    usDob,
    isoDob,
  };
}

/**
 * Trích xuất chuỗi ngày sinh từ bất kỳ tên cột nào trong record.
 */
export function getDobString(r) {
  if (!r || typeof r !== 'object') return '';
  if (r.birthyear && r.birthmonth) {
    const mm = String(r.birthmonth).padStart(2, '0');
    const dd = String(r.birthday || '01').padStart(2, '0');
    return `${mm}/${dd}/${r.birthyear}`;
  }
  return r.namsinh || r.ngaysinh || r.ngaythangnamsinh || r.dob || r.birthdate || r.dateofbirth || r.birthday || r.bday || r.birth || '';
}

/**
 * Trích xuất chuỗi địa chỉ từ bất kỳ tên cột nào trong record.
 */
export function getAddressString(r) {
  if (!r || typeof r !== 'object') return '';
  return r.address || r.streetaddress || r.street || r.street_address || r.streetaddr || r.diachi || r.addr || r.address1 || r.address_1 || r.addressline1 || r.streetline1 || r.street1 || r.homeaddress || r.fulladdress || '';
}

/**
 * Danh sách mẫu nhận diện các trường thông dụng (đa ngôn ngữ Anh - Việt, hỗ trợ cả form gộp và form chia tách).
 */
const semanticCategories = [
  // 1. Thẻ ngân hàng & thanh toán (kiểm tra trước DOB và phone để tránh 'card_exp_month' khớp nhầm /month/)
  {
    type: 'card_number',
    patterns: [/cardnumber/, /creditcard/, /ccnumber/, /cardno/, /debitcard/],
    resolve: (r) => r.cardnumber || r.creditcard,
  },
  {
    type: 'card_exp_month',
    patterns: [/cardexpiresmonth/, /card.*exp.*month/, /exp.*month/, /ccexpmonth/, /expiration.*month/, /^cardexpmonth$/],
    resolve: (r) => r.cardexpiresmonth || r.cardexpmonth,
  },
  {
    type: 'card_exp_year',
    patterns: [/cardexpiresyear/, /card.*exp.*year/, /exp.*year/, /ccexpyear/, /expiration.*year/, /^cardexpyear$/],
    resolve: (r) => r.cardexpiresyear || r.cardexpyear,
  },
  {
    type: 'card_cvv',
    patterns: [/cardvalidationcode/, /cvv/, /cvc/, /securitycode/, /cid/],
    resolve: (r) => r.cardvalidationcode || r.cvv,
  },

  // 2. Chia tách Date of Birth (kiểm tra trước DOB gộp)
  {
    type: 'dob_month',
    patterns: [/dob.*month/, /month.*dob/, /birth.*month/, /month.*birth/, /^month$/, /^mm$/, /^dobm$/, /^thang(sinh)?$/, /monthofbirth/],
    resolve: (r, metadata = {}) => {
      if (r.birthmonth) {
        const m = String(r.birthmonth);
        return (metadata.maxLength === 2 || metadata.kind === 'select') ? m.padStart(2, '0') : m;
      }
      const parsed = parseDobComponents(getDobString(r));
      if (!parsed) return null;
      if (metadata.maxLength === 2 || metadata.kind === 'select') {
        return parsed.monthPad || parsed.month;
      }
      return parsed.monthPad || parsed.month;
    },
  },
  {
    type: 'dob_day',
    patterns: [/dobday/, /dayofbirth/, /dob.*day/, /^day$/, /^dd$/, /dobd/],
    resolve: (r, metadata = {}) => {
      if (r.birthday && r.birthyear) {
        const d = String(r.birthday);
        return (metadata.maxLength === 2 || metadata.kind === 'select') ? d.padStart(2, '0') : d;
      }
      const parsed = parseDobComponents(getDobString(r));
      if (!parsed) return null;
      if (metadata.maxLength === 2 || metadata.kind === 'select') {
        return parsed.dayPad || parsed.day;
      }
      return parsed.dayPad || parsed.day;
    },
  },
  {
    type: 'dob_year',
    patterns: [/dob.*year/, /year.*dob/, /birth.*year/, /year.*birth/, /^year$/, /^yyyy$/, /^yy$/, /^doby$/, /^nam$/, /^namsinh$/, /birthyear/],
    resolve: (r, metadata = {}) => {
      if (r.birthyear) {
        const y = String(r.birthyear);
        return metadata.maxLength === 2 ? y.slice(-2) : y;
      }
      const parsed = parseDobComponents(getDobString(r));
      if (!parsed) return null;
      if (metadata.maxLength === 2) return parsed.shortYear;
      return parsed.year;
    },
  },
  // 2. Chia tách Phone (kiểm tra trước Phone gộp)
  {
    type: 'phone_area',
    patterns: [/^(areacode|phone1|tel1|phonearea)$/],
    resolve: (r) => {
      const phone = (r.phonenumber || r.phone || r.cellphone || r.homephone || '').replace(/\D/g, '');
      return phone.length >= 10 ? phone.slice(0, 3) : null;
    },
  },
  {
    type: 'phone_prefix',
    patterns: [/^(prefix|phone2|tel2|phoneprefix)$/],
    resolve: (r) => {
      const phone = (r.phonenumber || r.phone || r.cellphone || r.homephone || '').replace(/\D/g, '');
      return phone.length >= 10 ? phone.slice(3, 6) : null;
    },
  },
  {
    type: 'phone_line',
    patterns: [/^(line|linenumber|phone3|tel3|phoneline)$/],
    resolve: (r) => {
      const phone = (r.phonenumber || r.phone || r.cellphone || r.homephone || '').replace(/\D/g, '');
      return phone.length >= 10 ? phone.slice(6, 10) : null;
    },
  },
  // 3. Chia tách SSN (kiểm tra trước SSN gộp)
  {
    type: 'ssn1',
    patterns: [/^ssn1$/],
    resolve: (r) => {
      const ssn = (r.ssn || '').replace(/\D/g, '');
      return ssn.length >= 9 ? ssn.slice(0, 3) : null;
    },
  },
  {
    type: 'ssn2',
    patterns: [/^ssn2$/],
    resolve: (r) => {
      const ssn = (r.ssn || '').replace(/\D/g, '');
      return ssn.length >= 9 ? ssn.slice(3, 5) : null;
    },
  },
  {
    type: 'ssn3',
    patterns: [/^ssn3$/],
    resolve: (r) => {
      const ssn = (r.ssn || '').replace(/\D/g, '');
      return ssn.length >= 9 ? ssn.slice(5, 9) : null;
    },
  },
  // 4. Các trường họ tên
  {
    type: 'first_name',
    patterns: [/^(first|fname|given|forename)/, /^ten$/, /firstname/],
    resolve: (r) => r.firstname || r.fname || (r.fullname ? r.fullname.trim().split(/\s+/)[0] : null),
  },
  {
    type: 'middle_name',
    patterns: [/^(middle|mname|mid|initial|minitial|middleinitial)/, /^tendem$/],
    resolve: (r) => {
      if (r.middleinitial || r.middlename || r.mname) return r.middleinitial || r.middlename || r.mname;
      if (r.fullname) {
        const parts = r.fullname.trim().split(/\s+/);
        if (parts.length >= 3) return parts.slice(1, -1).join(' ');
      }
      return null;
    },
  },
  {
    type: 'last_name',
    patterns: [/^(last|lname|sur|family)/, /^ho$/, /lastname/],
    resolve: (r) => r.lastname || r.lname || (r.fullname ? r.fullname.trim().split(/\s+/).slice(1).join(' ') || r.fullname : null),
  },
  {
    type: 'full_name',
    patterns: [/^(full|your)?name$/, /^(hoten|customername)$/],
    resolve: (r) => r.fullname || (r.firstname && r.lastname ? `${r.firstname} ${r.lastname}` : null),
  },
  // 5. Date of Birth gộp
  {
    type: 'dob',
    patterns: [
      /^(dob|birthdate|dateofbirth|birthday|bday|namsinh|ngaysinh|ngaythangnamsinh|birth|mmddyyyy|mmddyy|ddmmyyyy|birthdt)$/,
      /date.*birth/,
      /birth.*date/,
    ],
    resolve: (r, metadata = {}) => {
      const raw = getDobString(r);
      if (!raw) return null;
      const parsed = parseDobComponents(raw);
      if (!parsed) return raw;
      if (metadata.type === 'date') return parsed.isoDob || raw;
      if (metadata.maxLength === 4 || (metadata.kind === 'select' && !metadata.names?.some((n) => /month|day/i.test(n)))) {
        return parsed.year;
      }
      return parsed.usDob || raw;
    },
  },
  // 6. Số điện thoại gộp
  {
    type: 'phone',
    patterns: [/phone/, /^tel(ephone)?$/, /mobile/, /cell/, /^sdt$/, /dienthoai/],
    resolve: (r) => r.phonenumber || r.phone || r.cellphone || r.homephone || r.workphone || r.telephone || r.mobile || r.cell || r.sdt,
  },
  // 7. Email
  {
    type: 'email',
    patterns: [/email/, /^mail$/],
    resolve: (r, metadata = {}) => {
      const assigned = metadata?.assignedEmail || r.assignedEmail;
      if (assigned) return assigned;
      const em = r.email || r.emailaddress || r.mail || r.userid;
      if (em) return em.includes('@') ? em : `${em}@gmail.com`;
      return generateFallbackEmail(r);
    },
  },
  // 8. SSN gộp
  {
    type: 'ssn',
    patterns: [/ssn/, /socialsecurity/, /^social$/],
    resolve: (r) => r.ssn || r.socialsecurity,
  },
  // 9. Địa chỉ (address2 kiểm tra trước address để tránh address khớp nhầm ô address2)
  {
    type: 'address2',
    patterns: [/address2/, /^apt/, /^suite/, /^unit/, /addressline2/, /streetline2/, /street2/],
    resolve: (r) => r.address2 || r.apt || r.suite || '',
  },
  {
    type: 'address',
    patterns: [/address/, /street/, /^diachi$/, /^addr/, /address1/, /addressline1/, /streetline1/, /streetaddress/, /street1/],
    resolve: (r) => getAddressString(r),
  },
  {
    type: 'city',
    patterns: [/city/, /town/, /thanhpho/],
    resolve: (r) => r.city || r.town || r.thanhpho,
  },
  {
    type: 'state',
    patterns: [/state/, /province/, /region/, /bang/, /tinh/, /stateorprovince/],
    resolve: (r) => r.state || r.province || r.stateorprovince,
  },
  {
    type: 'zip',
    patterns: [/zip/, /postal/, /postcode/],
    resolve: (r) => r.zipcode || r.zip || r.ziporpostcode || r.ziporpostalcode || r.postalcode || r.postcode || r.postal || r.mabuudien,
  },
  {
    type: 'gender',
    patterns: [/gender/, /^sex$/, /gioitinh/],
    resolve: (r) => {
      const g = r.gender || r.sex || r.gioitinh || '';
      if (g) {
        if (/^m(ale)?$|^nam$/i.test(g)) return 'Male';
        if (/^f(emale)?$|^nu$/i.test(g)) return 'Female';
        return g;
      }
      return 'Male';
    },
  },
  {
    type: 'age',
    patterns: [/^age$/, /^tuoi$/, /your.*age/],
    resolve: (r) => {
      if (r.age) return String(r.age);
      const ageCalc = calculateAge(r);
      return ageCalc !== null ? String(ageCalc) : null;
    },
  },
  // 10. Ngân hàng & tài khoản
  {
    type: 'routing',
    patterns: [/routing/, /^aba$/, /transit/],
    resolve: (r) => r.routing || r.routingnumber || r.aba,
  },
  {
    type: 'bank_name',
    patterns: [/bankname/, /namebank/, /^bank$/, /nganhang/, /institution/],
    resolve: (r) => r.namebank || r.bankname || r.bank || r.nganhang,
  },
  {
    type: 'account_number',
    patterns: [/accountnumber/, /accountno/, /acctnumber/, /acctno/, /^number$/, /^account$/],
    resolve: (r) => r.number || r.accountnumber || r.accountno || r.account,
  },
];

/**
 * Chuẩn hóa độ dài của giá trị theo giới hạn maxLength của ô input nếu có.
 *
 * @param {string} value Giá trị chuỗi đã tìm được.
 * @param {object} metadata Thông tin chi tiết của ô input.
 * @return {string} Giá trị đã điều chỉnh.
 */
function formatMatchedValue(value, metadata = {}) {
  let val = String(value ?? '').trim();
  const maxLen = Number(metadata.maxLength);
  if (Number.isInteger(maxLen) && maxLen > 0 && val.length > maxLen) {
    const digitsOnly = val.replace(/\D/g, '');
    if (digitsOnly.length <= maxLen) {
      val = digitsOnly;
    }
  }

  // Tự động bảo đảm Email luôn có domain hợp lệ (@gmail.com) nếu thiếu ký tự @
  const isEmailField = metadata.type === 'email' || metadata.names?.some((n) => /email|mail/i.test(n));
  if (isEmailField && val && !val.includes('@')) {
    val = `${val}@gmail.com`;
  }

  return val;
}

/**
 * Kiểm tra xem tên candidate có phải là trường email hay không.
 * Phân biệt chính xác giữa email và mailing address / postal address.
 *
 * @param {string} candidate Tên trường hoặc id/label.
 * @return {boolean}
 */
export function isEmailFieldName(candidate) {
  const norm = normalizeFieldName(candidate);
  if (!norm) return false;
  if (/email/i.test(norm)) return true;
  if (/^(mail|thudientu|usermail|customermail)$/i.test(norm)) return true;
  if (/mail/i.test(norm) && !/address|street|diachi|box|list/i.test(norm)) return true;
  return false;
}

/**
 * Tìm giá trị phù hợp trong record cho danh sách tên/nhãn của ô input.
 *
 * @param {string[]} candidateNames Danh sách tên, id, nhãn, placeholder, autocomplete của ô.
 * @param {Record<string, string>} record Bản ghi dữ liệu đã chuẩn hóa tên trường.
 * @param {object} metadata Thông tin cấu trúc của ô input (type, kind, maxLength).
 * @return {string|null} Giá trị cần điền hoặc null nếu không khớp.
 */
export function matchFieldValue(candidateNames, record, metadata = {}) {
  const normalizedCandidates = candidateNames
    .map(normalizeFieldName)
    .filter((n) => n.length > 0);

  if (metadata.type === 'email' && !normalizedCandidates.includes('email')) {
    normalizedCandidates.unshift('email');
  }
  if (metadata.type === 'tel' && !normalizedCandidates.some((c) => c.includes('phone') || c.includes('tel'))) {
    normalizedCandidates.unshift('phone');
  }
  if (normalizedCandidates.some((c) => /zip|postal|postcode/i.test(c)) && !normalizedCandidates.includes('zipcode')) {
    normalizedCandidates.unshift('zipcode', 'zip');
  }

  if (!normalizedCandidates.length) return null;

  // Ưu tiên cao nhất: nếu là ô email và đã có email mẫu được gán (assignedEmail) từ danh sách email mẫu
  const isEmailField = metadata.type === 'email' || normalizedCandidates.some(isEmailFieldName);
  const assignedEmail = metadata.assignedEmail || record.assignedEmail;
  if (isEmailField && assignedEmail) {
    return formatMatchedValue(assignedEmail, metadata);
  }

  // 1. Kiểm tra khớp chính xác với bất kỳ key nào trong record
  for (const candidate of normalizedCandidates) {
    if (Object.hasOwn(record, candidate) && record[candidate] !== '') {
      if (/^(namsinh|ngaysinh|ngaythangnamsinh|dob|birthdate|dateofbirth|birthday|bday)$/.test(candidate)) {
        const parsed = parseDobComponents(record[candidate]);
        if (parsed) {
          if (metadata.type === 'date') return parsed.isoDob;
          if (metadata.maxLength === 4 || (metadata.kind === 'select' && !metadata.names?.some((n) => /month|day/i.test(n)))) {
            return parsed.year;
          }
          return formatMatchedValue(parsed.usDob, metadata);
        }
      }
      return formatMatchedValue(record[candidate], metadata);
    }
  }

  // 2. Tìm kiếm theo từ điển đồng nghĩa (Synonyms / Semantic Categories)
  for (const candidate of normalizedCandidates) {
    for (const cat of semanticCategories) {
      if (cat.patterns.some((pattern) => pattern.test(candidate))) {
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
    if (!value) continue;
    for (const candidate of normalizedCandidates) {
      if (key.length >= 4 && candidate.includes(key)) return formatMatchedValue(value, metadata);
      if (candidate.length >= 4 && key.includes(candidate)) return formatMatchedValue(value, metadata);
    }
  }

  // 4. Fallback đặc biệt cho Email: nếu form có ô email mà record thiếu hoặc chưa khớp
  if (isEmailField) {
    const em = assignedEmail || record.email || record.emailaddress || record.mail || record.userid;
    if (em) return formatMatchedValue(em.includes('@') ? em : `${em}@gmail.com`, metadata);
    return generateFallbackEmail(record);
  }

  // 5. Fallback đặc biệt cho Zip Code: nếu form có ô mã bưu chính
  if (normalizedCandidates.some((c) => /zip|postal|postcode/.test(c))) {
    const zipVal = record.zipcode || record.zip || record.ziporpostcode || record.ziporpostalcode || record.postalcode || record.postcode || record.postal;
    if (zipVal) return formatMatchedValue(zipVal, metadata);

    // Tra cứu mã zip theo bang (State) của người dùng
    const st = String(record.state || record.stateorprovince || record.province || '').toUpperCase().trim();
    const defaultStateZipCodes = {
      AL: '35203', AK: '99654', AZ: '85001', AR: '72201', CA: '90001', CO: '80201',
      CT: '06101', DE: '19801', FL: '33101', GA: '30301', HI: '96801', ID: '83701',
      IL: '60601', IN: '46201', IA: '50301', KS: '66601', KY: '40201', LA: '70112',
      ME: '04101', MD: '21201', MA: '02101', MI: '48201', MN: '55401', MS: '39201',
      MO: '63101', MT: '59601', NE: '68101', NV: '89101', NH: '03301', NJ: '07101',
      NM: '87101', NY: '10001', NC: '27601', ND: '58501', OH: '43201', OK: '73101',
      OR: '97201', PA: '19101', RI: '02901', SC: '29201', SD: '57101', TN: '37201',
      TX: '75001', UT: '84101', VT: '05601', VA: '23219', WA: '98101', WV: '25301',
      WI: '53201', WY: '82001', DC: '20001',
    };
    if (st && defaultStateZipCodes[st]) {
      return defaultStateZipCodes[st];
    }
  }

  // 6. Fallback đặc biệt cho Địa chỉ: nếu form có ô địa chỉ (address, street, streetaddress, address1)
  if (normalizedCandidates.some((c) => /address|street|diachi|^addr/i.test(c)) && !normalizedCandidates.some((c) => /address2|apt|suite|unit/i.test(c))) {
    const addr = getAddressString(record) || record.address || record.address1 || record.addressline1 || record.streetaddress || record.street;
    if (addr) return formatMatchedValue(addr, metadata);
    return '100 Main St';
  }

  return null;
}

/**
 * Kiểm tra xem một ô checkbox có phải là ô xác nhận đồng ý điều khoản / consent / disclosure hay không.
 *
 * @param {object} metadata Thông tin phần tử checkbox thu thập từ DOM.
 * @return {boolean} True nếu là checkbox cần tự động tích.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
export function isConsentCheckbox(metadata) {
  if (!metadata || metadata.type !== 'checkbox') return false;

  const id = String(metadata.id || '').toLowerCase();
  const name = String(metadata.name || '').toLowerCase();
  const classes = String(metadata.classes || '').toLowerCase();
  const names = Array.isArray(metadata.names) ? metadata.names.map((n) => String(n).toLowerCase()) : [];
  const textContent = names.join(' ');
  const dataAttributes = metadata.dataAttributes || {};

  // 1. Kiểm tra ID hoặc name
  if (/digitalconsent|consent|disclosure|agree|terms|tcpa|optin|opt_in|privacy|policy|acknowledge/i.test(`${id} ${name}`)) {
    return true;
  }

  // 2. Kiểm tra data- attributes (ví dụ: data-tf-element-role="consent-opt-in", data-leadid-type="disclosure")
  for (const [key, val] of Object.entries(dataAttributes)) {
    const keyLower = String(key).toLowerCase();
    const valLower = String(val).toLowerCase();
    if (keyLower.includes('consent') || keyLower.includes('disclosure') || valLower.includes('consent') || valLower.includes('disclosure')) {
      return true;
    }
  }

  // 3. Kiểm tra class hoặc container class (ví dụ: .consent-box, .consent-row)
  if (/consent|disclosure|tcpa|terms-and-conditions|privacy-policy/i.test(classes)) {
    return true;
  }

  // 4. Kiểm tra văn bản nhãn / mô tả đi kèm (ví dụ: "By clicking Continue, I represent that I am 18+ years of age...")
  if (/by clicking|i represent|18\+|i agree|i consent|terms of service|terms and conditions|privacy policy|marketing partners|express written consent|disclosure|tôi đồng ý|điều khoản/i.test(textContent)) {
    return true;
  }

  // 5. Checkbox có thuộc tính required
  if (metadata.required) return true;

  return false;
}

/**
 * Tìm nút gửi (Submit / Continue / Next) trên trang hoặc frame.
 *
 * @param {object} frame Frame hoặc Page của Playwright.
 * @return {Promise<object|null>} Locator của nút submit hoặc null nếu không tìm thấy.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
export async function findSubmitButton(frame) {
  const candidateSelectors = [
    // 1. Nút Submit / Continue theo data- attributes chuẩn của Vector & Lead forms (chỉ chọn thẻ tương tác, không chọn generic container)
    'button[data-vector-submit="true"], button[data-vector-submit], a[data-vector-submit="true"], a[data-vector-submit], input[data-vector-submit="true"], [role="button"][data-vector-submit="true"]',
    'button[data-tf-element-role="submit"], a[data-tf-element-role="submit"], [role="button"][data-tf-element-role="submit"]',
    'button#btn-submit, button#submit-btn, button#submit, button#continue, a#btn-submit, a#continue',

    // 2. Thẻ submit tiêu chuẩn của HTML
    'button[type="submit"]',
    'input[type="submit"]',
    'input[type="button"][value*="Continue" i], input[type="button"][value*="Submit" i], input[type="button"][value*="Next" i]',

    // 3. Nút bấm theo class phổ biến
    'button.continue-btn, button.submit-btn, button.btn-submit, button.btn-continue, button.btn-next, button.next-btn, button.btn-primary',
    'a.continue-btn, a.submit-btn, a.btn-submit, a.btn-continue, a.btn-next, a.next-btn, a.button-next, a.btn-primary',

    // 4. Nút bấm theo text phổ biến (tiếng Anh & tiếng Việt)
    'button:has-text("Continue"), button:has-text("Submit"), button:has-text("Next"), button:has-text("Tiếp tục"), button:has-text("Get Quote"), button:has-text("Get My Quote"), button:has-text("Agree"), button:has-text("AGREE & CONTINUE"), button:has-text("Tiếp theo"), button:has-text("Xác nhận"), button:has-text("Get Started"), button:has-text("See My Results"), button:has-text("View My Results"), button:has-text("Check My Rate"), button:has-text("Claim Now"), button:has-text("Proceed"), button:has-text("Finish"), button:has-text("Hoàn thành")',
    'a:has-text("Continue"), a:has-text("Submit"), a:has-text("Next"), a:has-text("Tiếp tục"), a:has-text("Get Quote"), a:has-text("Agree"), a:has-text("AGREE & CONTINUE"), a:has-text("Get Started"), a:has-text("See My Results"), a:has-text("Claim Now"), a:has-text("Proceed")',
    '[role="button"]:has-text("Continue"), [role="button"]:has-text("Submit"), [role="button"]:has-text("Next"), [role="button"]:has-text("Agree"), [role="button"]:has-text("Tiếp tục"), [role="button"]:has-text("Get Started"), [role="button"]:has-text("See My Results")',
  ];

  for (const selector of candidateSelectors) {
    try {
      const candidates = await frame.locator(selector).all();
      for (const btn of candidates) {
        if (!(await btn.isVisible().catch(() => false))) continue;

        // Xác thực phần tử nút bấm: loại trừ tuyệt đối IFRAME, FORM hoặc container DIV lớn
        const validation = typeof btn.evaluate === 'function' ? await btn.evaluate((el) => {
          const tag = (el.tagName || 'BUTTON').toUpperCase();
          if (['IFRAME', 'FRAME', 'FORM', 'BODY', 'HTML', 'MAIN', 'SECTION', 'ARTICLE'].includes(tag)) {
            return { valid: false, reason: 'container_tag' };
          }

          // Kiểm tra kích thước hình học nếu có: nút bấm không thể quá nhỏ hoặc quá khổng lồ
          if (typeof el.getBoundingClientRect === 'function') {
            const rect = el.getBoundingClientRect();
            if (rect.width <= 4 || rect.height <= 4) return { valid: false, reason: 'zero_size' };
            if (rect.height > 180 || rect.width > 900) return { valid: false, reason: 'too_large' };
          }

          // Bỏ qua các nút thuộc Offerwall Cards để nhường quyền xử lý cho handleOfferwallCards
          if (
            (typeof el.closest === 'function' && el.closest('.offerwall-card, form[data-tf-element-role="offer"], .offerwall-card-wrap')) ||
            (el.classList && typeof el.classList.contains === 'function' && el.classList.contains('offerwall-btn')) ||
            (typeof el.getAttribute === 'function' && el.getAttribute('data-tf-element-role') === 'offer-btn')
          ) {
            return { valid: false, reason: 'offerwall' };
          }

          const text = (el.innerText || el.value || el.textContent || '').trim().toLowerCase();
          if (/cancel|back|previous|quay lại|hủy|close|đóng|sign in|login|đăng nhập|skip|bỏ qua/i.test(text)) {
            return { valid: false, reason: 'cancel_text' };
          }

          if (tag === 'BUTTON') return { valid: true };
          if (tag === 'INPUT' && ['submit', 'button', 'image'].includes((el.type || '').toLowerCase())) return { valid: true };
          if (tag === 'A' || (typeof el.getAttribute === 'function' && el.getAttribute('role') === 'button')) return { valid: true };

          if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
            const style = window.getComputedStyle(el);
            if (style && style.cursor === 'pointer' && text.length > 0 && text.length < 60) return { valid: true };
          }

          return { valid: true };
        }).catch(() => ({ valid: true })) : { valid: true };

        if (!validation.valid) continue;

        // Nếu nút bị disabled, thử gỡ disabled nếu ô đã hoàn tất điền
        const isEnabled = await btn.isEnabled().catch(() => false);
        if (!isEnabled) {
          await btn.evaluate((el) => {
            el.removeAttribute('disabled');
            el.disabled = false;
            el.classList.remove('disabled');
            el.setAttribute('aria-disabled', 'false');
          }).catch(() => {});
        }

        return btn;
      }
    } catch {}
  }
  return null;
}

/**
 * Tính số tuổi ước tính dựa vào ngày sinh trong bản ghi người dùng.
 *
 * @param {object} record Bản ghi người dùng.
 * @return {number|null} Số tuổi hoặc null nếu không xác định được năm sinh.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
export function calculateAge(record) {
  if (!record || typeof record !== 'object') return null;
  const dobStr = getDobString(record);
  const parsed = parseDobComponents(dobStr);
  if (!parsed || !parsed.year) return null;
  const birthYear = parseInt(parsed.year, 10);
  if (Number.isNaN(birthYear) || birthYear < 1900 || birthYear > 2100) return null;
  const currentYear = new Date().getFullYear();
  return currentYear - birthYear;
}

/**
 * Kiểm tra xem một nhãn lựa chọn dải tuổi có bao gồm độ tuổi chỉ định hay không.
 * Hỗ trợ các định dạng: "18 - 34", "35-49", "50 - 64", "OVER 65", "65+", "Under 25".
 *
 * @param {string} optionText Nhãn văn bản của lựa chọn.
 * @param {number} age Độ tuổi cần đối sánh.
 * @return {boolean} True nếu khớp dải tuổi.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
export function matchAgeRange(optionText, age) {
  if (typeof age !== 'number' || Number.isNaN(age)) return false;
  const text = String(optionText || '').trim();

  // 1. Khoảng dạng "18 - 34", "35-49", "50 - 64", "18 to 24"
  const rangeMatch = text.match(/(\d+)\s*(?:[-–to]+|\s+to\s+)\s*(\d+)/i);
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1], 10);
    const max = parseInt(rangeMatch[2], 10);
    if (!Number.isNaN(min) && !Number.isNaN(max)) {
      return age >= min && age <= max;
    }
  }

  // 2. Dạng "OVER 65", "65+", "> 65", "65 and older", "65 or older"
  const overMatch = text.match(/(?:over|>|hơn|trên|\+)\s*(\d+)|(\d+)\s*(?:\+|and older|or older)/i);
  if (overMatch) {
    const min = parseInt(overMatch[1] || overMatch[2], 10);
    if (!Number.isNaN(min)) {
      return age >= min;
    }
  }

  // 3. Dạng "UNDER 25", "< 25", "dưới 25"
  const underMatch = text.match(/(?:under|<|dưới)\s*(\d+)/i);
  if (underMatch) {
    const max = parseInt(underMatch[1], 10);
    if (!Number.isNaN(max)) {
      return age < max;
    }
  }

  return false;
}

/**
 * Tự động trả lời câu hỏi khảo sát: chọn ngẫu nhiên các nút radio, nút lựa chọn Yes/No, câu hỏi thu nhập hoặc khớp tuổi từ ngày sinh.
 * Hỗ trợ đa dạng các mẫu giao diện (Vector Survey, Creative Debt & Homeowner, Age link choices, Yes/No buttons).
 *
 * @param {object} frame Frame Playwright đang quét.
 * @param {object} [record={}] Bản ghi dữ liệu hiện tại để ưu tiên nếu có cấu hình.
 * @return {Promise<number>} Số câu hỏi đã được chọn/trả lời.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
export async function handleRadioAndSurveyOptions(frame, record = {}) {
  let answeredCount = 0;

  // 1. Xử lý các nhóm radio buttons tiêu chuẩn (<input type="radio">)
  try {
    const radioGroups = await frame.locator('input[type="radio"]').evaluateAll((radios) => {
      const groups = {};
      radios.forEach((r, idx) => {
        if (r.disabled) return;
        const groupKey = r.name || r.closest('fieldset, .form-group, .question, .form-row, div')?.getAttribute('id') || `unnamed_group_${idx}`;
        if (!groups[groupKey]) {
          groups[groupKey] = {
            hasChecked: false,
            items: [],
          };
        }
        if (r.checked) groups[groupKey].hasChecked = true;

        const label = typeof r.closest === 'function' ? r.closest('label') : null;
        const doc = typeof document !== 'undefined' ? document : null;
        const labelFor = doc && r.id ? doc.querySelector(`label[for="${r.id}"]`) : null;
        const targetLabel = label || labelFor;
        const labelText = (targetLabel?.innerText || targetLabel?.textContent || '').trim();
        groups[groupKey].items.push({
          id: r.id || '',
          name: r.name || '',
          value: r.value || '',
          label: labelText,
          index: idx,
        });
      });
      return groups;
    }).catch(() => ({}));

    for (const [groupKey, group] of Object.entries(radioGroups)) {
      if (group.hasChecked || !group.items.length) continue;

      // Ưu tiên nếu trong record có trường khớp
      let chosen = null;
      const normalizedKey = normalizeFieldName(groupKey);
      if (record && record[normalizedKey]) {
        const targetVal = String(record[normalizedKey]).toLowerCase();
        chosen = group.items.find((item) =>
          item.value.toLowerCase() === targetVal ||
          item.label.toLowerCase() === targetVal ||
          (targetVal === 'yes' && /yes|co|true/i.test(`${item.value} ${item.label}`)) ||
          (targetVal === 'no' && /no|khong|false/i.test(`${item.value} ${item.label}`))
        );
      }

      // Nếu không khớp trong record, chọn ngẫu nhiên một lựa chọn bất kỳ
      if (!chosen) {
        chosen = group.items[Math.floor(Math.random() * group.items.length)];
      }

      try {
        let radioLocator = null;
        if (chosen.id) {
          radioLocator = frame.locator(`input[type="radio"]#${chosen.id}`).first();
        } else if (chosen.name && chosen.value) {
          radioLocator = frame.locator(`input[type="radio"][name="${chosen.name}"][value="${chosen.value}"]`).first();
        } else {
          radioLocator = frame.locator('input[type="radio"]').nth(chosen.index);
        }

        if (radioLocator && (await radioLocator.count() > 0)) {
          if (typeof radioLocator.scrollIntoViewIfNeeded === 'function') {
            await radioLocator.scrollIntoViewIfNeeded().catch(() => {});
          }
          const radioPause = Math.floor(Math.random() * 120) + 120;
          await new Promise((r) => setTimeout(r, radioPause));
          await radioLocator.click({ timeout: 1200 }).catch(async () => {
            await radioLocator.evaluate((el) => {
              const label = el.closest('label') || (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
              if (label) label.click();
            }).catch(() => {});
          });

          await radioLocator.evaluate((el) => {
            if (!el.checked) {
              el.checked = true;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }).catch(() => {});

          await radioLocator.dispatchEvent('input').catch(() => {});
          await radioLocator.dispatchEvent('change').catch(() => {});
          answeredCount += 1;
        }
      } catch {}
    }
  } catch {}

  // 2. Xử lý các câu hỏi khảo sát / lựa chọn dạng button / thẻ <a> (Vector Survey, Creative, Age options, Yes/No)
  try {
    const questionChoiceGroups = await frame.evaluate(() => {
      const results = [];
      const optionSelector = [
        'button.btn-option',
        'button[data-vector-answer="true"]',
        'button[data-element-type="survey_answer"]',
        '.creative-survey-answer',
        'a.primary-btn',
        'a.offer-click-tracking-no-link',
        'button:not([type="submit"]):not(.btn-submit):not(.faq-trigger):not(.offerwall-btn)',
        '[role="radio"]',
        '[role="button"]:not(.btn-submit):not(.offerwall-btn)',
        '.option-btn, .choice-btn, .quiz-btn, .answer-btn, label.btn',
        '.options-container a',
      ].join(', ');

      const containerSelector = [
        '.step-container',
        '.options-container',
        '.creative',
        '[data-element-type="survey_question"]',
        '.question',
        '.survey-step',
        '.quiz-step',
        'fieldset',
        '.card-options',
        '.choice-container',
        '.options-grid',
        'div[role="radiogroup"]',
        '.choices',
        '.survey-question',
        '.options-list',
      ].join(', ');

      const containers = Array.from(document.querySelectorAll(containerSelector));

      containers.forEach((container, groupIndex) => {
        // Bỏ qua nếu bên trong chứa các input thông thường cần điền (tránh nhầm với form điền)
        if (container.querySelector('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])')) return;

        // Bỏ qua nếu thuộc Offerwall Card
        if (container.closest('.offerwall-card, form[data-tf-element-role="offer"], .offerwall-card-wrap')) return;

        const candidateOptions = Array.from(container.querySelectorAll(optionSelector));
        if (candidateOptions.length < 2) return;

        // Kiểm tra xem đã có nút nào trong container này được click hoặc đang active
        const alreadyActive = candidateOptions.some((b) =>
          b.classList.contains('active') ||
          b.classList.contains('selected') ||
          b.getAttribute('aria-checked') === 'true' ||
          b.getAttribute('data-autolead-clicked') === '1'
        );
        if (alreadyActive) return;

        const titleEl = container.querySelector('h1, h2, h3, h4, .main-question, .survey-label, .creative-survey-question, legend, .question-title, p');
        const questionTitle = (titleEl?.innerText || titleEl?.textContent || '').trim();

        const items = [];
        candidateOptions.forEach((btn, optIndex) => {
          const uid = `choice_${groupIndex}_${optIndex}_${Date.now()}`;
          btn.setAttribute('data-autolead-choice-id', uid);
          items.push({
            uid,
            id: btn.id || '',
            text: (btn.innerText || btn.textContent || '').trim(),
            value: btn.getAttribute('data-value') || btn.getAttribute('data-vector-field-value') || btn.getAttribute('value') || btn.getAttribute('data-option-id') || '',
            field: btn.getAttribute('data-vector-field') || btn.getAttribute('data-field') || '',
            tagName: btn.tagName.toLowerCase(),
            href: btn.getAttribute('href') || '',
          });
        });

        if (items.length >= 2) {
          results.push({
            questionTitle,
            items,
          });
        }
      });

      // Fallback: Nếu không tìm thấy trong container, tìm các cụm nút Yes/No hoặc Survey standalone
      if (!results.length) {
        const standaloneVectorButtons = Array.from(document.querySelectorAll('button[data-vector-answer="true"], button.btn-option'));
        if (standaloneVectorButtons.length >= 2) {
          const alreadyActive = standaloneVectorButtons.some((b) => b.getAttribute('data-autolead-clicked') === '1');
          if (!alreadyActive) {
            results.push({
              questionTitle: 'vector_survey',
              items: standaloneVectorButtons.map((btn, optIndex) => {
                const uid = `choice_vec_${optIndex}_${Date.now()}`;
                btn.setAttribute('data-autolead-choice-id', uid);
                return {
                  uid,
                  id: btn.id || '',
                  text: (btn.innerText || btn.textContent || '').trim(),
                  value: btn.getAttribute('data-vector-field-value') || '',
                  field: btn.getAttribute('data-vector-field') || '',
                  tagName: btn.tagName.toLowerCase(),
                };
              }),
            });
          }
        }
      }

      if (!results.length) {
        const allButtons = Array.from(document.querySelectorAll('button:not([type="submit"]):not(.btn-submit):not(.faq-trigger):not(.offerwall-btn), [role="button"]:not(.btn-submit):not(.offerwall-btn)'));
        const yesBtn = allButtons.find((b) => /^(yes|có|true|agree)$/i.test((b.innerText || b.textContent || '').trim()));
        const noBtn = allButtons.find((b) => /^(no|không|false|disagree)$/i.test((b.innerText || b.textContent || '').trim()));
        if (yesBtn && noBtn) {
          const isYesActive = yesBtn.classList.contains('active') || yesBtn.classList.contains('selected') || yesBtn.getAttribute('data-autolead-clicked') === '1';
          const isNoActive = noBtn.classList.contains('active') || noBtn.classList.contains('selected') || noBtn.getAttribute('data-autolead-clicked') === '1';
          if (!isYesActive && !isNoActive) {
            const uidYes = `choice_yes_${Date.now()}`;
            const uidNo = `choice_no_${Date.now()}`;
            yesBtn.setAttribute('data-autolead-choice-id', uidYes);
            noBtn.setAttribute('data-autolead-choice-id', uidNo);
            results.push({
              questionTitle: 'yes_no',
              items: [
                { uid: uidYes, id: yesBtn.id || '', text: (yesBtn.innerText || yesBtn.textContent || '').trim(), value: 'yes', tagName: yesBtn.tagName.toLowerCase() },
                { uid: uidNo, id: noBtn.id || '', text: (noBtn.innerText || noBtn.textContent || '').trim(), value: 'no', tagName: noBtn.tagName.toLowerCase() },
              ],
            });
          }
        }
      }

      return results;
    }).catch(() => []);

    for (const group of questionChoiceGroups) {
      if (!group.items || !group.items.length) continue;

      let picked = null;
      const titleLower = (group.questionTitle || '').toLowerCase();

      // A. Nếu là câu hỏi tuổi: ưu tiên khớp tuổi từ record nếu có
      const isAgeQuestion = /age|tuổi|how old|năm sinh|year of birth/i.test(titleLower) ||
        group.items.some((it) => /\d+\s*[-–]\s*\d+|over\s*\d+|\d+\+/i.test(it.text));
      if (isAgeQuestion) {
        const userAge = calculateAge(record);
        if (typeof userAge === 'number') {
          picked = group.items.find((it) => matchAgeRange(it.text, userAge));
        }
      }

      // B. Nếu là câu hỏi Nhà ở (Rent vs Own): ưu tiên đối chiếu record nếu có
      if (!picked && (/own or rent|homeowner|nhà ở/i.test(titleLower) || group.items.some((it) => /rent|own/i.test(it.value)))) {
        const homeVal = String(record?.homeowner || record?.housing || '').toLowerCase();
        if (homeVal.includes('own')) {
          picked = group.items.find((it) => /own/i.test(`${it.value} ${it.text}`));
        } else if (homeVal.includes('rent')) {
          picked = group.items.find((it) => /rent/i.test(`${it.value} ${it.text}`));
        }
      }

      // C. Nếu không khớp tiêu chí riêng: chọn ngẫu nhiên một lựa chọn trong danh sách
      if (!picked) {
        picked = group.items[Math.floor(Math.random() * group.items.length)];
      }

      if (picked?.uid) {
        try {
          const locator = frame.locator(`[data-autolead-choice-id="${picked.uid}"]`).first();
          if (locator && (await locator.count() > 0)) {
            if (typeof locator.scrollIntoViewIfNeeded === 'function') {
              await locator.scrollIntoViewIfNeeded().catch(() => {});
            }
            const surveyPause = Math.floor(Math.random() * 200) + 200;
            await new Promise((r) => setTimeout(r, surveyPause));
            await locator.click({ timeout: 1500, force: true }).catch(async () => {
              await locator.evaluate((el) => {
                el.click();
                el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
              }).catch(() => {});
            });

            await locator.evaluate((el) => {
              el.setAttribute('data-autolead-clicked', '1');
              el.classList.add('selected', 'active');
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              if (el.tagName.toLowerCase() === 'a' && el.href && !el.href.startsWith('javascript:')) {
                try { window.location.href = el.href; } catch {}
              }
            }).catch(() => {});

            answeredCount += 1;
          }
        } catch {}
      }
    }
  } catch {}

  return answeredCount;
}

/**
 * Phát hiện và tự động mở tất cả các view/thẻ trên trang Offerwall cuối cùng.
 *
 * @param {object} frame Frame Playwright đang quét.
 * @param {object} [page=null] Page Playwright hiện tại để fallback mở tab nếu cần.
 * @return {Promise<number>} Số lượng thẻ offerwall đã được kích hoạt mở.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
export async function handleOfferwallCards(frame, page = null) {
  let openedCount = 0;
  try {
    const cardsToOpen = await frame.evaluate(() => {
      const cards = Array.from(document.querySelectorAll(
        '.offerwall-card-wrap, .offerwall-card, form[data-tf-element-role="offer"], .campaign-card'
      ));
      const unhandled = [];
      cards.forEach((card, idx) => {
        if (card.getAttribute('data-autolead-opened') === '1') return;
        const form = card.closest('form') || (card.tagName.toLowerCase() === 'form' ? card : null);
        if (form && form.getAttribute('data-autolead-opened') === '1') return;

        const uid = `offerwall_card_${idx}_${Date.now()}`;
        card.setAttribute('data-autolead-card-id', uid);
        card.setAttribute('data-autolead-opened', '1');
        if (form) form.setAttribute('data-autolead-opened', '1');

        const btn = card.querySelector('.offerwall-btn, button[type="submit"], button#btnSubmit, a.offerwall-btn, [data-tf-element-role="offer-btn"]');
        const destUrl = card.getAttribute('data-destination-url') || form?.getAttribute('data-destination-url') || card.querySelector('a[href]')?.getAttribute('href') || '';

        unhandled.push({
          uid,
          hasBtn: Boolean(btn),
          destUrl,
        });
      });
      return unhandled;
    }).catch(() => []);

    if (!cardsToOpen || !cardsToOpen.length) return 0;

    for (const card of cardsToOpen) {
      try {
        const cardLoc = frame.locator(`[data-autolead-card-id="${card.uid}"]`).first();
        if (await cardLoc.count() > 0) {
          const btn = cardLoc.locator('.offerwall-btn, button[type="submit"], button#btnSubmit, a.offerwall-btn, [data-tf-element-role="offer-btn"]').first();
          if ((await btn.count() > 0) && (await btn.isVisible().catch(() => false))) {
            await btn.click({ timeout: 2000, force: true }).catch(async () => {
              await btn.evaluate((b) => {
                b.click();
                const form = b.closest('form');
                if (form) form.submit();
              }).catch(() => {});
            });
            openedCount += 1;
            await new Promise((resolve) => setTimeout(resolve, 500));
            continue;
          }
        }

        // Fallback mở trực tiếp destination url trong tab mới nếu không tìm thấy nút bấm
        if (card.destUrl && card.destUrl.startsWith('http') && page?.context) {
          try {
            const newPage = await page.context().newPage();
            await newPage.goto(card.destUrl, { timeout: 15000 }).catch(() => {});
            openedCount += 1;
            await new Promise((resolve) => setTimeout(resolve, 500));
          } catch {}
        }
      } catch {}
    }
  } catch {}
  return openedCount;
}

/**
 * Nhập văn bản mô phỏng hành vi gõ phím của người thật (Anti-bot detection avoidance):
 * - Cuộn mượt tới phần tử, click để focus ô nhập liệu.
 * - Nghỉ ngắn ngẫu nhiên (100ms - 220ms) như người thật chuẩn bị gõ.
 * - Gõ tuần tự từng ký tự với độ trễ biến thiên tự nhiên (35ms - 85ms).
 * - Dừng lâu hơn một chút (120ms - 200ms) tại các ký tự đặc biệt (@, ., space, -, /).
 * - Bổ sung cơ chế fallback setter nếu ô có mask hoặc script trang can thiệp.
 *
 * @param {object} field Locator của trường nhập liệu.
 * @param {string|number} text Nội dung cần nhập.
 * @param {object} [page=null] Đối tượng Page của Playwright để dùng waitForTimeout.
 * @return {Promise<void>}
 */
export async function humanType(field, text, page = null) {
  const str = String(text ?? '');
  if (!str) return;

  try {
    if (typeof field.scrollIntoViewIfNeeded === 'function') {
      await field.scrollIntoViewIfNeeded().catch(() => {});
    }
    if (typeof field.click === 'function') {
      await field.click({ force: true, timeout: 1500 }).catch(() => {});
    }
    if (typeof field.focus === 'function') {
      await field.focus().catch(() => {});
    }
  } catch {}

  const prePause = Math.floor(Math.random() * 120) + 100;
  if (page && typeof page.waitForTimeout === 'function') {
    await page.waitForTimeout(prePause).catch(() => {});
  } else {
    await new Promise((r) => setTimeout(r, prePause));
  }

  // Xóa giá trị cũ nếu đang có để tránh bị dính ký tự trước đó
  if (typeof field.evaluate === 'function') {
    await field.evaluate((el) => { el.value = ''; }).catch(() => {});
  }

  // Gõ tuần tự từng ký tự mô phỏng nhịp gõ của con người
  let typedOk = false;
  if (typeof field.pressSequentially === 'function') {
    try {
      for (let i = 0; i < str.length; i++) {
        const char = str[i];
        let charDelay = Math.floor(Math.random() * 50) + 35;
        if ([' ', '@', '.', '-', '_', '/'].includes(char)) {
          charDelay += Math.floor(Math.random() * 70) + 50;
        }
        await field.pressSequentially(char, { delay: charDelay });
      }
      typedOk = true;
    } catch {
      typedOk = false;
    }
  }

  // Fallback: nếu pressSequentially bị gián đoạn hoặc chưa có, dùng fill
  if (!typedOk && typeof field.fill === 'function') {
    try {
      await field.fill(str, { force: true, timeout: 2500 });
      typedOk = true;
    } catch {}
  }

  // Kiểm tra lại giá trị sau khi gõ: nếu rỗng (do mask hoặc validator trang), đặt trực tiếp qua property descriptor
  let postVal = '';
  if (typeof field.inputValue === 'function') {
    postVal = await field.inputValue().catch(() => '');
  }
  if ((!postVal || postVal.trim() === '') && typeof field.evaluate === 'function') {
    await field.evaluate((el, val) => {
      const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc?.set) {
        desc.set.call(el, val);
      } else {
        el.value = val;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, str).catch(() => {});
  }

  // Dừng nhẹ tự nhiên sau khi hoàn thành trường (80ms - 160ms)
  const postPause = Math.floor(Math.random() * 80) + 80;
  if (page && typeof page.waitForTimeout === 'function') {
    await page.waitForTimeout(postPause).catch(() => {});
  } else {
    await new Promise((r) => setTimeout(r, postPause));
  }
}

/**
 * Theo dõi form trong một profile Chrome và điền một bản ghi ngẫu nhiên khi form xuất hiện.
 * Hỗ trợ quét sâu vào tất cả iframe trên trang, không giới hạn origin cứng nhắc, tự động tích ô điều khoản và gửi form.
 *
 * @param {object} context Playwright BrowserContext của profile.
 * @param {object[]} records Các bản ghi đã chuẩn hóa.
 * @param {string} allowedOrigin Origin website đích (chỉ để tham khảo, không chặn redirect).
 * @param {object} session Phiên để cập nhật số trường đã điền và đồng bộ record.
 * @param {object} [options={}] Tùy chọn nâng cao như autoSubmit.
 * @return {void} Đăng ký theo dõi các trang hiện tại và trang mở sau.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
export function attachAutofill(context, records, allowedOrigin, session = {}, options = {}) {
  if (!records.length) return;
  const trackedPages = new WeakSet();

  // Chọn 1 bản ghi duy nhất cho toàn bộ phiên này để nhất quán xuyên suốt các trang/bước/frame
  if (session.recordIndex === undefined || session.recordIndex < 0 || session.recordIndex >= records.length) {
    session.recordIndex = randomInt(records.length);
  }
  const record = records[session.recordIndex];
  if (session.assignedEmail && record) {
    record.email = session.assignedEmail;
    record.emailaddress = session.assignedEmail;
    record.mail = session.assignedEmail;
    record.assignedEmail = session.assignedEmail;
  }
  session.autofillRecord = session.recordIndex + 1;
  options.onRecordPicked?.(record);

  /**
   * Điền các trường còn trống trên form đang hiển thị của một trang và các frame con.
   *
   * @param {object} page Trang Chrome cần xử lý.
   * @return {Promise<void>} Hoàn tất lượt quét form.
   */
  async function fillVisibleForms(page) {
    if (page.isClosed()) return;
    if (session.leadCheckStatus === 'waiting' || session.leadCheckStatus === 'failed') return;
    const currentUrl = page.url();
    if (!currentUrl || currentUrl.startsWith('about:') || currentUrl.startsWith('chrome:')) return;


    const frames = typeof page.frames === 'function' ? page.frames() : [page];
    const unmatchedFieldNames = new Set();
    let visibleFieldCount = 0;

    for (const frame of frames) {
      if (session.leadCheckStatus === 'waiting' || session.leadCheckStatus === 'failed') return;
      let fields = [];
      try {
        fields = await frame.locator('input, textarea, select').all();
      } catch {
        continue;
      }

      let filledInThisPass = 0;

      for (const field of fields) {
        if (session.leadCheckStatus === 'waiting' || session.leadCheckStatus === 'failed') return;
        try {
          if (!(await field.isVisible()) || !(await field.isEnabled())) continue;
          const isMarkedFilled = (await field.getAttribute('data-autolead-filled')) === '1';
          if (isMarkedFilled) {
            const currentVal = await field.inputValue().catch(() => null);
            const hasError = await field.evaluate((el) => {
              if (el.classList.contains('error') || el.getAttribute('aria-invalid') === 'true') return true;
              const parent = el.closest('.input-group, .form-group, .field, .loco-group');
              return parent ? parent.querySelector('.error, .visible, .helper-text.visible') !== null : false;
            }).catch(() => false);

            // Nếu đã fill nhưng giá trị hiện tại bị rỗng hoặc đang bị báo lỗi -> xóa mark để điền lại
            if ((currentVal !== null && currentVal.trim() === '') || hasError) {
              await field.evaluate((el) => el.removeAttribute('data-autolead-filled')).catch(() => {});
            } else {
              continue;
            }
          }

          const metadata = await field.evaluate((element) => {
            const labels = [];
            if (element.labels) {
              for (const l of element.labels) {
                const t = (l.innerText || l.textContent || '').trim();
                if (t) labels.push(t);
              }
            }
            if (element.id && labels.length === 0) {
              try {
                const directLabel = document.querySelector(`label[for="${element.id}"]`);
                if (directLabel) {
                  const t = (directLabel.innerText || directLabel.textContent || '').trim();
                  if (t) labels.push(t);
                }
              } catch {}
            }

            const container = element.closest('.form-group, .input-group, .field, .input-container, .form-row, .field-group, .form-field, .consent-box, .consent-row, label, tr, td, p, div');
            let containerText = '';
            if (container) {
              try {
                const clone = container.cloneNode(true);
                clone.querySelectorAll('select, script, style').forEach((s) => s.remove());
                containerText = (clone.innerText || clone.textContent || '').trim();
              } catch {
                containerText = (container.innerText || container.textContent || '').trim();
              }
            }

            const prev = element.previousElementSibling;
            const prevText = prev ? (prev.innerText || prev.textContent || '').trim() : '';

            const next = element.nextElementSibling;
            const nextText = next ? (next.innerText || next.textContent || '').trim() : '';

            const dataAttributes = {};
            if (element.attributes) {
              for (const attr of element.attributes) {
                if (attr.name.startsWith('data-')) dataAttributes[attr.name] = attr.value;
              }
            }

            const vectorField = element.getAttribute('data-vector-field') || '';

            return {
              id: element.id || '',
              name: element.getAttribute('name') || '',
              classes: `${element.className || ''} ${container ? container.className || '' : ''}`,
              dataAttributes,
              required: Boolean(element.required),
              checked: Boolean(element.checked),
              names: [
                element.getAttribute('aria-label'),
                vectorField,
                element.getAttribute('placeholder'),
                element.getAttribute('name'),
                element.id,
                element.getAttribute('autocomplete'),
                element.getAttribute('data-name'),
                element.getAttribute('data-field'),
                element.getAttribute('data-testid'),
                element.getAttribute('data-qa'),
                element.getAttribute('data-tf-element-role'),
                element.getAttribute('data-leadid-type'),
                ...Object.values(dataAttributes),
                element.getAttribute('title'),
                ...labels,
                nextText.slice(0, 100),
                prevText.slice(0, 50),
                containerText.slice(0, 400),
              ].filter(Boolean),
              kind: element.tagName.toLowerCase(),
              type: element.getAttribute('type')?.toLowerCase(),
              value: element.value,
              readOnly: element.readOnly,
              maxLength: element.maxLength,
            };
          });

          // Xử lý ô checkbox: nếu là ô đồng ý điều khoản/consent thì tự động tích
          if (metadata.type === 'checkbox') {
            if (isConsentCheckbox(metadata)) {
              visibleFieldCount += 1;
              if (!metadata.checked) {
                try {
                  await field.scrollIntoViewIfNeeded().catch(() => {});
                  const consentPause = Math.floor(Math.random() * 120) + 120;
                  if (page && typeof page.waitForTimeout === 'function') {
                    await page.waitForTimeout(consentPause).catch(() => {});
                  } else {
                    await new Promise((r) => setTimeout(r, consentPause));
                  }
                  await field.click({ timeout: 1500 }).catch(() => {});
                  await field.evaluate((el) => {
                    if (!el.checked) {
                      el.checked = true;
                    }
                    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    const label = el.closest('label') || document.querySelector(`label[for="${el.id}"]`);
                    if (label && !el.checked) label.click();
                  }).catch(() => {});
                  await field.dispatchEvent('input').catch(() => {});
                  await field.dispatchEvent('change').catch(() => {});
                  await field.evaluate((el) => { el.dataset.autoleadFilled = '1'; }).catch(() => {});
                  session.autofillFields = (session.autofillFields ?? 0) + 1;
                  session.autofillError = null;
                  filledInThisPass += 1;

                  const consentName = metadata.names?.[0] || metadata.id || metadata.name || 'consent';
                  options.onLog?.({
                    type: 'checkbox_checked',
                    tag: 'INPUT',
                    id: metadata.id || null,
                    name: metadata.name || null,
                    text: consentName.slice(0, 100),
                    detail: `Đã tự động tích ô điều khoản: ${metadata.id || metadata.name || 'checkbox'}`,
                  });
                } catch {}
              }
            }
            continue;
          }

          if (metadata.readOnly || ['hidden', 'radio', 'file', 'submit', 'button', 'reset', 'image'].includes(metadata.type)) continue;

          const valueToFill = matchFieldValue(metadata.names, record, {
            ...metadata,
            assignedEmail: session.assignedEmail || record.assignedEmail,
          });
          if (!valueToFill) {
            // Nếu là thẻ select câu hỏi (như Yes/No, câu hỏi khảo sát) mà không khớp trường trong record:
            // Tự động chọn ngẫu nhiên một option hợp lệ (ngoại trừ option placeholder đầu tiên)!
            if (metadata.kind === 'select' && (!metadata.value || metadata.value === '')) {
              const picked = await field.evaluate((sel) => {
                const validOptions = Array.from(sel.options).filter((opt, idx) => {
                  if (idx === 0 && (!opt.value || /select|choose|chọn|vui lòng/i.test(opt.text))) return false;
                  return Boolean(opt.value);
                });
                if (validOptions.length > 0) {
                  const chosen = validOptions[Math.floor(Math.random() * validOptions.length)];
                  sel.value = chosen.value;
                  sel.dispatchEvent(new Event('input', { bubbles: true }));
                  sel.dispatchEvent(new Event('change', { bubbles: true }));
                  return true;
                }
                return false;
              }).catch(() => false);
              if (picked) {
                await field.evaluate((el) => { el.dataset.autoleadFilled = '1'; }).catch(() => {});
                session.autofillFields = (session.autofillFields ?? 0) + 1;
                filledInThisPass += 1;
                continue;
              }
            }

            const displayName = metadata.names[0] ?? '';
            if (displayName) unmatchedFieldNames.add(displayName.slice(0, 40));
            continue;
          }

          // Bỏ qua nếu ô đã có giá trị thật (ngoại trừ mask rỗng như (___) ___-____, +1, mm/dd/yyyy hoặc email/zip chưa hợp lệ)
          if (metadata.kind !== 'select' && metadata.value) {
            const currentVal = metadata.value.trim();
            const isPlaceholderMask = /^(\+1|\+1\s*|\(___\)\s*___-____|___-__-____|[_\-\(\)\s\.\/]+|mm\/dd\/yyyy)$/i.test(currentVal);
            const isInvalidEmail = (metadata.type === 'email' || metadata.names?.some((n) => /email|mail/i.test(n))) && !currentVal.includes('@');
            const isInvalidZip = metadata.names?.some((n) => /zip|postal|postcode/i.test(n)) && currentVal.replace(/\D/g, '').length < 5;
            if (currentVal !== '' && !isPlaceholderMask && !isInvalidEmail && !isInvalidZip) continue;
          }

          if (metadata.kind === 'select') {
            await field.scrollIntoViewIfNeeded().catch(() => {});
            await field.click({ force: true, timeout: 1000 }).catch(() => {});
            const selectPause = Math.floor(Math.random() * 100) + 120;
            if (page && typeof page.waitForTimeout === 'function') {
              await page.waitForTimeout(selectPause).catch(() => {});
            } else {
              await new Promise((r) => setTimeout(r, selectPause));
            }

            const candidates = [valueToFill];
            const upper = valueToFill.toUpperCase();
            if (usStateNames[upper]) candidates.push(usStateNames[upper]);
            const lower = valueToFill.toLowerCase();
            if (usStateCodes[lower]) candidates.push(usStateCodes[lower]);

            // Mở rộng ứng viên cho Month dropdown
            const numVal = parseInt(valueToFill, 10);
            if (!Number.isNaN(numVal) && numVal >= 1 && numVal <= 12) {
              const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
              const padMonth = String(numVal).padStart(2, '0');
              const name = monthNames[numVal];
              candidates.push(String(numVal), padMonth, name, name.slice(0, 3));
              candidates.push(`${padMonth} - ${name}`, `${numVal} - ${name}`, `${padMonth}/${name}`, `${name} (${padMonth})`);
            }
            // Mở rộng ứng viên cho Day dropdown
            if (!Number.isNaN(numVal) && numVal >= 1 && numVal <= 31) {
              candidates.push(String(numVal), String(numVal).padStart(2, '0'));
            }
            // Mở rộng ứng viên cho Year dropdown
            if (!Number.isNaN(numVal) && numVal >= 1900 && numVal <= 2100) {
              candidates.push(String(numVal), String(numVal).slice(-2));
            }

            let selected = false;
            for (const val of candidates) {
              try {
                await field.selectOption({ label: val }, { force: true, timeout: 800 });
                selected = true;
                break;
              } catch {}
              try {
                await field.selectOption(val, { force: true, timeout: 800 });
                selected = true;
                break;
              } catch {}
              try {
                await field.selectOption({ value: val }, { force: true, timeout: 800 });
                selected = true;
                break;
              } catch {}
            }

            // Quét trực tiếp danh sách <option> trong DOM nếu Playwright chưa khớp
            if (!selected) {
              selected = await field.evaluate((select, searchVals) => {
                const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
                const searchNorms = searchVals.map(norm).filter(Boolean);
                for (const option of select.options) {
                  const valNorm = norm(option.value);
                  const labelNorm = norm(option.text || option.label);
                  if (searchNorms.some((sn) => valNorm === sn || labelNorm === sn || labelNorm.startsWith(sn))) {
                    select.value = option.value;
                    select.dispatchEvent(new Event('input', { bubbles: true }));
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    return true;
                  }
                }
                return false;
              }, candidates).catch(() => false);
            }

            if (!selected) {
              await field.selectOption({ index: 1 }, { force: true, timeout: 1000 }).catch(() => {});
            }

            // Kích hoạt đầy đủ các sự kiện input, change, blur cho dropdown để các validator và script theo dõi nhận diện ngay
            await field.evaluate((el) => {
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              el.dispatchEvent(new Event('blur', { bubbles: true }));
            }).catch(() => {});
          } else {
            // Nhập từ từ mô phỏng nhịp gõ phím của người thật (chống bị phát hiện bot autofill)
            await humanType(field, valueToFill, page);

            // Với ô địa chỉ, nếu xuất hiện dropdown gợi ý autocomplete (như Google Places, Loqate/Loco, PCA), tự bấm gợi ý đầu
            const isAddressField = metadata.names.some((n) => /address|street|diachi/i.test(n));
            if (isAddressField) {
              try {
                await page.waitForTimeout(300);
                const suggestionSelector = '.loco-dropdown .loco-item, .loco-item, [class*="loco-"] [class*="suggestion"], [class*="loco-dropdown"] > div, .pac-container .pac-item, .pca .pcaitem, .address-autocomplete-item, .ui-autocomplete .ui-menu-item, [role="listbox"] [role="option"]';
                const suggestionItem = page.locator(suggestionSelector).first();
                if (await suggestionItem.isVisible({ timeout: 500 }).catch(() => false)) {
                  await suggestionItem.click({ force: true, timeout: 1000 }).catch(() => {});
                } else {
                  await field.press('ArrowDown').catch(() => {});
                  await page.waitForTimeout(100);
                  await field.press('Enter').catch(() => {});
                }
              } catch {}

              // Đảm bảo sau khi xử lý autocomplete, ô địa chỉ không bị widget xóa trắng
              const postAddressVal = await field.inputValue().catch(() => '');
              if (!postAddressVal || postAddressVal.trim() === '') {
                await field.evaluate((el, val) => {
                  const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
                  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
                  if (desc?.set) desc.set.call(el, val);
                  else el.value = val;
                  el.classList.remove('error');
                  el.classList.add('has-value');
                  const parent = el.closest('.input-group, .loco-group, .form-group');
                  if (parent) {
                    parent.classList.remove('error');
                    const helper = parent.querySelector('.helper-text, .error');
                    if (helper) helper.classList.remove('visible');
                  }
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                }, String(valueToFill)).catch(() => {});
              }
            }

            // Đảm bảo kích hoạt đầy đủ các sự kiện input, change, blur để cập nhật floating labels và trình xác thực (không gửi keyup Enter)
            await field.evaluate((el) => {
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              el.dispatchEvent(new Event('blur', { bubbles: true }));
            }).catch(() => {});
            await field.dispatchEvent('input').catch(() => {});
            await field.dispatchEvent('change').catch(() => {});
            await field.dispatchEvent('blur').catch(() => {});
          }

          // Kiểm tra chắc chắn trường đã có giá trị thực tế trước khi đánh dấu thành công
          let finalVal = '';
          if (metadata.kind === 'select') {
            finalVal = await field.evaluate((el) => el.value || '').catch(() => '');
          } else {
            finalVal = await field.inputValue().catch(() => '');
          }
          if (!finalVal || finalVal.trim() === '') {
            // Trường vẫn rỗng, không đánh dấu và không tính là đã điền
            continue;
          }

          await field.evaluate((element) => {
            element.dataset.autoleadFilled = '1';
            element.classList.remove('error');
            element.classList.add('has-value');
            const parent = element.closest('.input-group, .loco-group, .form-group');
            if (parent) {
              parent.classList.remove('error');
              const helper = parent.querySelector('.helper-text, .error');
              if (helper) helper.classList.remove('visible');
            }
          }).catch(() => {});
          session.autofillFields = (session.autofillFields ?? 0) + 1;
          session.autofillError = null;
          filledInThisPass += 1;

          options.onLog?.({
            type: 'field_filled',
            tag: (metadata.kind || 'input').toUpperCase(),
            id: metadata.id || metadata.name || null,
            name: metadata.name || null,
            text: String(valueToFill).slice(0, 50),
            detail: `Đã điền [${metadata.names?.[0] || metadata.id || 'ô'}]: ${String(valueToFill).slice(0, 30)}`,
          });

          // Dừng nhẹ giữa các trường (120ms - 250ms) như người dùng liếc mắt chuyển sang ô tiếp theo
          const fieldPause = Math.floor(Math.random() * 130) + 120;
          if (page && typeof page.waitForTimeout === 'function') {
            await page.waitForTimeout(fieldPause).catch(() => {});
          } else {
            await new Promise((resolve) => setTimeout(resolve, fieldPause));
          }
        } catch {
          // Trường có thể không tương tác được lúc này
        }
      }

      // Nếu có trường vừa được điền hoặc tick trong pass này, chờ 350ms để DOM cập nhật trạng thái
      if (filledInThisPass > 0) {
        await new Promise((resolve) => { setTimeout(resolve, 350); });
      }

      // Tự động trả lời câu hỏi khảo sát: chọn ngẫu nhiên radio buttons hoặc lựa chọn Yes/No/Tuổi/Thu nhập
      try {
        const answeredSurvey = await handleRadioAndSurveyOptions(frame, record);
        if (answeredSurvey > 0) {
          filledInThisPass += answeredSurvey;
          session.autofillFields = (session.autofillFields ?? 0) + answeredSurvey;
          session.autofillError = null;
          options.onLog?.({
            type: 'survey_answered',
            detail: `Đã tự động chọn câu trả lời khảo sát/lựa chọn (${answeredSurvey} câu).`,
          });
        }
      } catch {}

      // Tự động phát hiện và mở đồng loạt tất cả các thẻ Offerwall trên trang cuối
      try {
        const openedOffers = await handleOfferwallCards(frame, page);
        if (openedOffers > 0) {
          filledInThisPass += openedOffers;
          session.autofillFields = (session.autofillFields ?? 0) + openedOffers;
          session.autofillError = null;
          options.onLog?.({
            type: 'offerwall_opened',
            detail: `Đã tự động mở ${openedOffers} thẻ ưu đãi (Offerwall).`,
          });
        }
      } catch {}

      // Tự động bấm nút gửi / tiếp tục nếu có tùy chọn autoSubmit và vừa điền hoặc tích xong các trường
      // Kiểm tra an toàn trước khi submit: Nếu trên form hiện tại vẫn còn trường bắt buộc (required / *) hoặc trường đang bị lỗi chưa có dữ liệu, KHÔNG được bấm submit!
      const hasUnfilledRequiredOrErrorField = await frame.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea'));
        for (const input of inputs) {
          if (input.disabled || input.offsetParent === null) continue;
          const style = window.getComputedStyle(input);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

          const val = (input.value || '').trim();
          const isChecked = input.type === 'checkbox' || input.type === 'radio' ? input.checked : true;

          const isRequiredAttr = input.required || input.getAttribute('aria-required') === 'true';
          const hasErrorClass = input.classList.contains('error') || input.getAttribute('aria-invalid') === 'true';
          const parentGroup = input.closest('.input-group, .form-group, .field, .loco-group, .step-container');
          const hasParentError = parentGroup ? Boolean(parentGroup.querySelector('.error, .visible, .helper-text.visible')) : false;

          let labelIsRequired = false;
          if (input.id) {
            const lbl = document.querySelector(`label[for="${input.id}"]`);
            if (lbl && (lbl.innerText || lbl.textContent || '').includes('*')) labelIsRequired = true;
          }
          if (!labelIsRequired && parentGroup) {
            const lbl = parentGroup.querySelector('label');
            if (lbl && (lbl.innerText || lbl.textContent || '').includes('*')) labelIsRequired = true;
          }

          if ((isRequiredAttr || labelIsRequired || hasErrorClass || hasParentError) && (!val || !isChecked)) {
            return {
              unfilled: true,
              id: input.id || input.name || 'unknown',
              type: input.type || input.tagName.toLowerCase(),
            };
          }
        }
        return { unfilled: false };
      }).catch(() => ({ unfilled: false }));

      if (hasUnfilledRequiredOrErrorField?.unfilled) {
        options.onLog?.({
          type: 'submit_deferred',
          detail: `Chưa thể submit vì trường bắt buộc [${hasUnfilledRequiredOrErrorField.id}] còn trống hoặc đang báo lỗi.`,
        });
      } else if (options.autoSubmit !== false && (filledInThisPass > 0 || (session.autofillFields ?? 0) > 0)) {
        try {
          // 1. Thử tìm nút submit trong frame hiện tại
          let submitBtn = await findSubmitButton(frame);

          // 2. Fallback: Nếu không thấy trong frame này, tìm trên các frame khác hoặc page chính
          if (!submitBtn && typeof page.frames === 'function') {
            for (const otherFrame of page.frames()) {
              if (otherFrame === frame) continue;
              submitBtn = await findSubmitButton(otherFrame);
              if (submitBtn) break;
            }
          }
          if (!submitBtn && frame !== page) {
            submitBtn = await findSubmitButton(page);
          }

          if (submitBtn) {
            const btnInfo = await submitBtn.evaluate((btn) => {
              const text = (btn.innerText || btn.value || btn.textContent || '').trim().slice(0, 80);
              const tag = (btn.tagName || '').toUpperCase();
              const id = btn.id || null;
              const now = Date.now();
              const lastClick = Number(btn.dataset.autoleadLastSubmitTime || 0);
              // Nếu vừa click trong vòng 2.5s thì không click lại để tránh duplicate submit
              if (now - lastClick < 2500) return { shouldClick: false, text, tag, id };
              btn.dataset.autoleadLastSubmitTime = String(now);
              btn.dataset.autoleadSubmitted = '1';
              return { shouldClick: true, text, tag, id };
            }).catch(() => null);

            if (btnInfo?.shouldClick) {
              const submitLabel = btnInfo.text || btnInfo.id || 'Submit';
              console.log(`[Autofill] Bấm nút submit: <${btnInfo.tag}> "${submitLabel}" id="${btnInfo.id}"`);

              // Ghi log submit rõ ràng vào session logs
              options.onLog?.({
                type: 'submit_clicked',
                tag: btnInfo.tag,
                id: btnInfo.id,
                text: submitLabel,
                detail: `Đã bấm nút submit/tiếp tục: <${btnInfo.tag}> "${submitLabel}"`,
              });

              // Mô phỏng người dùng dừng lại kiểm tra form trước khi bấm submit (500ms - 900ms)
              const reviewPause = Math.floor(Math.random() * 400) + 500;
              await new Promise((resolve) => { setTimeout(resolve, reviewPause); });

              // Cuộn phần tử vào tầm nhìn
              await submitBtn.scrollIntoViewIfNeeded().catch(() => {});
              await new Promise((resolve) => { setTimeout(resolve, Math.floor(Math.random() * 200) + 150); });

              // Đảm bảo gỡ bỏ hoàn toàn disabled và pointer-events bị khóa
              await submitBtn.evaluate((b) => {
                b.disabled = false;
                b.removeAttribute('disabled');
                b.classList.remove('disabled');
                b.setAttribute('aria-disabled', 'false');
                b.style.pointerEvents = 'auto';
              }).catch(() => {});

              // Thao tác click Playwright
              try {
                await submitBtn.click({ force: true, timeout: 2500 });
              } catch (clickErr) {
                console.warn('[Autofill] Playwright click lỗi, dùng fallback evaluate click:', clickErr.message);
              }

              // Luôn kích hoạt native click và form.requestSubmit() để đảm bảo ăn chắc 100%
              await submitBtn.evaluate((btn) => {
                try { btn.click(); } catch {}
                const form = btn.closest('form');
                if (form && typeof form.requestSubmit === 'function') {
                  try { form.requestSubmit(btn); } catch {
                    try { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); } catch {}
                  }
                }
              }).catch(() => {});

              // Màn đầu tiên vừa được submit: kích hoạt kiểm tra lead từ API nếu được cấu hình
              if (options.enableLeadCheck !== false && !session.screen1Completed) {
                session.screen1Completed = true;
                session.leadCheckStatus = 'waiting';
                if (typeof options.onFirstScreenCompleted === 'function') {
                  options.onFirstScreenCompleted(session, page);
                }
                return;
              }
            }
          } else if (filledInThisPass > 0) {
            console.log(`[Autofill] Đã điền ${filledInThisPass} trường nhưng chưa tìm thấy nút Submit phù hợp trên trang.`);
          }
        } catch (submitErr) {
          console.error('[Autofill] Lỗi trong quá trình xử lý submit:', submitErr.message);
        }
      }
    }

    if (session.autofillFields) return;
    if (unmatchedFieldNames.size) {
      session.autofillError = 'Không ô nào khớp tên cột. Ô trên trang: '
        + [...unmatchedFieldNames].slice(0, 12).join(', ');
    } else if (!visibleFieldCount) {
      session.autofillError = 'Chưa phát hiện thấy form hoặc ô nhập nào trên trang.';
    }
  }

  /**
   * Gắn lịch quét cho một tab để nhận cả form tải chậm và form mở động.
   *
   * @param {object} page Tab Chrome cần theo dõi.
   * @return {void} Đăng ký bộ hẹn giờ và dọn khi tab đóng.
   */
  function watchPage(page) {
    if (trackedPages.has(page)) return;
    trackedPages.add(page);
    let filling = false;
    let noProgressRounds = 0;
    const scan = async () => {
      if (filling || page.isClosed()) return;
      filling = true;
      const fieldsBefore = session.autofillFields ?? 0;
      try {
        await fillVisibleForms(page);
      } catch {
        // Trang có thể điều hướng hoặc đóng giữa hai lần quét.
      } finally {
        filling = false;
      }
      const filled = (session.autofillFields ?? 0) - fieldsBefore;
      if (filled > 0) {
        noProgressRounds = 0;
      } else {
        // Chỉ đếm vòng không tiến triển khi trang thực sự có form/input cần điền
        let hasInteractable = true;
        try {
          if (typeof page.evaluate === 'function' && !page.isClosed()) {
            hasInteractable = await page.evaluate(() => {
              return Boolean(document.querySelector(
                'input:not([type="hidden"]), select, textarea, button[type="submit"], input[type="submit"], [data-vector-submit="true"], button.btn-option, [data-vector-answer="true"], [data-element-type="survey_answer"]'
              ));
            });
          }
        } catch {
          hasInteractable = true;
        }

        if (hasInteractable) {
          noProgressRounds += 1;
        } else {
          // Trang chưa có form (đang redirect hoặc đang tải), reset bộ đếm để không trigger AI nhầm
          noProgressRounds = 0;
        }

        // 3 lần scan liên tiếp có form mà không fill được gì và không đang đợi lead → nhờ AI Assist
        if (noProgressRounds >= 3 && !session.aiAssistRunning && session.leadCheckStatus !== 'waiting' && !page.isClosed()) {
          noProgressRounds = 0;
          options.onStuck?.(page);
        }
      }
    };
    session.triggerAutofillScan = () => { void scan(); };
    const timer = setInterval(() => { void scan(); }, 1500);
    timer.unref?.();
    page.on('domcontentloaded', scan);
    page.on('load', scan);
    page.on('framenavigated', (frame) => {
      if (options.enableLeadCheck !== false && !session.screen1Completed && (session.autofillFields ?? 0) > 0) {
        if (typeof page.mainFrame === 'function' && frame === page.mainFrame()) {
          session.screen1Completed = true;
          session.leadCheckStatus = 'waiting';
          if (typeof options.onFirstScreenCompleted === 'function') {
            options.onFirstScreenCompleted(session, page);
          }
        }
      }
      void scan();
    });
    page.on('frameattached', scan);
    page.on('popup', (popup) => watchPage(popup));
    page.on('close', () => clearInterval(timer));
    void scan();
  }

  context.on('page', watchPage);
  for (const page of context.pages()) watchPage(page);
}


