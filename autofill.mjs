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
    return Object.fromEntries(headers.map((header) => {
      const value = record[header] ?? '';
      if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) {
        throw new Error('Giá trị tự điền phải là chữ, số hoặc true/false.');
      }
      return [normalizeFieldName(header), String(value ?? '')];
    }));
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
  // 1. Chia tách Date of Birth (kiểm tra trước DOB gộp)
  {
    type: 'dob_month',
    patterns: [/month/, /^mm$/, /dobm/, /thangsinh/, /thang/, /monthofbirth/],
    resolve: (r, metadata = {}) => {
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
    patterns: [/year/, /^yyyy$/, /^yy$/, /doby/, /^nam$/, /namsinh/, /birthyear/],
    resolve: (r, metadata = {}) => {
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
      const phone = (r.phonenumber || r.phone || '').replace(/\D/g, '');
      return phone.length >= 10 ? phone.slice(0, 3) : null;
    },
  },
  {
    type: 'phone_prefix',
    patterns: [/^(prefix|phone2|tel2|phoneprefix)$/],
    resolve: (r) => {
      const phone = (r.phonenumber || r.phone || '').replace(/\D/g, '');
      return phone.length >= 10 ? phone.slice(3, 6) : null;
    },
  },
  {
    type: 'phone_line',
    patterns: [/^(line|linenumber|phone3|tel3|phoneline)$/],
    resolve: (r) => {
      const phone = (r.phonenumber || r.phone || '').replace(/\D/g, '');
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
    patterns: [/^(middle|mname|mid|initial|minitial)/, /^tendem$/],
    resolve: (r) => {
      if (r.middlename || r.mname) return r.middlename || r.mname;
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
    resolve: (r) => r.phonenumber || r.phone || r.telephone || r.mobile || r.cell || r.sdt,
  },
  // 7. Email
  {
    type: 'email',
    patterns: [/email/, /^mail$/],
    resolve: (r) => {
      if (r.email || r.emailaddress || r.mail) return r.email || r.emailaddress || r.mail;
      if (r.fullname) {
        const parts = r.fullname.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').trim().split(/\s+/);
        const first = parts[0] || 'user';
        const last = parts.slice(1).join('') || 'lead';
        const digits = (r.phonenumber || r.zipcode || '77').replace(/\D/g, '').slice(-4);
        return `${first}.${last}${digits}@gmail.com`;
      }
      return null;
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
    patterns: [/state/, /province/, /region/, /bang/, /tinh/],
    resolve: (r) => r.state || r.province,
  },
  {
    type: 'zip',
    patterns: [/zip/, /postal/, /postcode/],
    resolve: (r) => r.zipcode || r.zip || r.postalcode || r.postal,
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
    patterns: [/accountnumber/, /accountno/, /acctnumber/, /acctno/, /cardnumber/, /^number$/, /^account$/],
    resolve: (r) => r.number || r.accountnumber || r.accountno || r.cardnumber || r.account,
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
  return val;
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

  if (!normalizedCandidates.length) return null;

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
    'button[data-vector-submit="true"], [data-vector-submit="true"], [data-vector-submit], button[data-tf-element-role="submit"], button#btn-submit',
    'button[type="submit"]',
    'input[type="submit"]',
    'button.continue-btn, button.submit-btn, a.continue-btn, a.submit-btn, button.btn-submit, a.btn-submit',
    'button:has-text("Continue"), button:has-text("Submit"), button:has-text("Next"), button:has-text("Tiếp tục"), button:has-text("Get Quote"), button:has-text("Get My Quote"), button:has-text("Agree"), button:has-text("AGREE & CONTINUE"), button:has-text("Tiếp theo"), button:has-text("Xác nhận")',
    '[role="button"]:has-text("Continue"), [role="button"]:has-text("Submit"), [role="button"]:has-text("Next"), [role="button"]:has-text("Agree")',
  ];

  for (const selector of candidateSelectors) {
    try {
      const candidates = await frame.locator(selector).all();
      for (const btn of candidates) {
        if ((await btn.isVisible()) && (await btn.isEnabled())) {
          const text = (await btn.innerText().catch(() => '')).trim().toLowerCase();
          if (/cancel|back|previous|quay lại|hủy|close|đóng|sign in|login|đăng nhập|skip|bỏ qua/i.test(text)) continue;
          return btn;
        }
      }
    } catch {}
  }
  return null;
}

/**
 * Tự động trả lời câu hỏi khảo sát: chọn ngẫu nhiên các nút radio hoặc nút lựa chọn Yes/No.
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

  // 2. Xử lý các câu hỏi Yes/No hoặc nhóm nút lựa chọn (không dùng thẻ input radio)
  try {
    const questionChoiceGroups = await frame.evaluate(() => {
      const results = [];
      const containers = Array.from(document.querySelectorAll('.question, .survey-step, .quiz-step, fieldset, .card-options, .choice-container, .options-grid, div[role="radiogroup"], .choices'));
      containers.forEach((container) => {
        if (container.querySelector('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])')) return;

        const buttons = Array.from(container.querySelectorAll('button:not([type="submit"]):not(.btn-submit):not(.faq-trigger), [role="radio"], [role="button"]:not(.btn-submit), .option-btn, .choice-btn, .quiz-btn, .answer-btn, label.btn'));
        const alreadyActive = buttons.some((b) => b.classList.contains('active') || b.classList.contains('selected') || b.getAttribute('aria-checked') === 'true');
        if (!alreadyActive && buttons.length >= 2 && buttons.length <= 6) {
          results.push(buttons.map((b, i) => ({
            id: b.id || '',
            text: (b.innerText || b.textContent || '').trim(),
            className: b.className || '',
            index: i,
          })));
        }
      });

      if (!results.length) {
        const allButtons = Array.from(document.querySelectorAll('button:not([type="submit"]):not(.btn-submit):not(.faq-trigger), [role="button"]:not(.btn-submit)'));
        const yesBtn = allButtons.find((b) => /^(yes|có|true|agree)$/i.test((b.innerText || b.textContent || '').trim()));
        const noBtn = allButtons.find((b) => /^(no|không|false|disagree)$/i.test((b.innerText || b.textContent || '').trim()));
        if (yesBtn && noBtn) {
          const isYesActive = yesBtn.classList.contains('active') || yesBtn.classList.contains('selected');
          const isNoActive = noBtn.classList.contains('active') || noBtn.classList.contains('selected');
          if (!isYesActive && !isNoActive) {
            results.push([
              { id: yesBtn.id || '', text: (yesBtn.innerText || yesBtn.textContent || '').trim() },
              { id: noBtn.id || '', text: (noBtn.innerText || noBtn.textContent || '').trim() },
            ]);
          }
        }
      }

      return results;
    }).catch(() => []);

    for (const group of questionChoiceGroups) {
      if (!group.length) continue;
      const pick = group[Math.floor(Math.random() * group.length)];
      try {
        let locator = null;
        if (pick.id) {
          locator = frame.locator(`#${pick.id}`).first();
        } else if (pick.text) {
          locator = frame.locator(`button:has-text("${pick.text}"), [role="button"]:has-text("${pick.text}")`).first();
        }
        if (locator && (await locator.isVisible({ timeout: 1000 }).catch(() => false))) {
          await locator.click({ timeout: 1500 }).catch(() => {});
          answeredCount += 1;
        }
      } catch {}
    }
  } catch {}

  return answeredCount;
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
          if (await field.getAttribute('data-autolead-filled') === '1') continue;

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
                  await field.click({ timeout: 1500 }).catch(() => {});
                  await field.evaluate((el) => {
                    if (!el.checked) {
                      el.checked = true;
                      el.dispatchEvent(new Event('input', { bubbles: true }));
                      el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    const label = el.closest('label') || document.querySelector(`label[for="${el.id}"]`);
                    if (label && !el.checked) label.click();
                  }).catch(() => {});
                  await field.dispatchEvent('input').catch(() => {});
                  await field.dispatchEvent('change').catch(() => {});
                  await field.evaluate((el) => { el.dataset.autoleadFilled = '1'; }).catch(() => {});
                  session.autofillFields = (session.autofillFields ?? 0) + 1;
                  session.autofillError = null;
                  filledInThisPass += 1;
                } catch {}
              }
            }
            continue;
          }

          if (metadata.readOnly || ['hidden', 'radio', 'file', 'submit', 'button', 'reset', 'image'].includes(metadata.type)) continue;

          const valueToFill = matchFieldValue(metadata.names, record, metadata);
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

          // Bỏ qua nếu ô đã có giá trị thật (ngoại trừ mask rỗng như (___) ___-____, +1, mm/dd/yyyy)
          if (metadata.kind !== 'select' && metadata.value) {
            const currentVal = metadata.value.trim();
            const isPlaceholderMask = /^(\+1|\+1\s*|\(___\)\s*___-____|___-__-____|[_\-\(\)\s\.\/]+|mm\/dd\/yyyy)$/i.test(currentVal);
            if (currentVal !== '' && !isPlaceholderMask) continue;
          }

          if (metadata.kind === 'select') {
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
            await field.click({ force: true, timeout: 1500 }).catch(() => {});
            await field.focus().catch(() => {});
            try {
              await field.fill(String(valueToFill), { force: true, timeout: 3000 });
            } catch {
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
              }, String(valueToFill));
            }

            // Đối với các ô có input mask (như ngày sinh MM/DD/YYYY) làm mất dữ liệu sau fill, tự động gõ tuần tự
            const filledVal = await field.inputValue().catch(() => '');
            if (!filledVal || (String(valueToFill).length >= 8 && filledVal.length < 5)) {
              await field.click({ force: true, timeout: 1000 }).catch(() => {});
              await field.pressSequentially(String(valueToFill), { delay: 25 }).catch(() => {});
            }

            // Đảm bảo kích hoạt đầy đủ các sự kiện input, change, keyup, blur để cập nhật floating labels và trình xác thực
            await field.evaluate((el) => {
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
              el.dispatchEvent(new Event('blur', { bubbles: true }));
            }).catch(() => {});
            await field.dispatchEvent('input').catch(() => {});
            await field.dispatchEvent('change').catch(() => {});
            await field.dispatchEvent('blur').catch(() => {});

            // Với ô địa chỉ, nếu xuất hiện dropdown gợi ý autocomplete (như Google Places), tự bấm gợi ý đầu
            const isAddressField = metadata.names.some((n) => /address|street|diachi/i.test(n));
            if (isAddressField) {
              try {
                await page.waitForTimeout(300);
                const pacItem = page.locator('.pac-container .pac-item, .address-autocomplete-item, .ui-autocomplete .ui-menu-item').first();
                if (await pacItem.isVisible({ timeout: 400 }).catch(() => false)) {
                  await pacItem.click().catch(() => {});
                }
              } catch {}
            }
          }

          await field.evaluate((element) => { element.dataset.autoleadFilled = '1'; }).catch(() => {});
          session.autofillFields = (session.autofillFields ?? 0) + 1;
          session.autofillError = null;
          filledInThisPass += 1;
        } catch {
          // Trường có thể không tương tác được lúc này
        }
      }

      // Tự động trả lời câu hỏi khảo sát: chọn ngẫu nhiên radio buttons hoặc lựa chọn Yes/No
      try {
        const answeredSurvey = await handleRadioAndSurveyOptions(frame, record);
        if (answeredSurvey > 0) {
          filledInThisPass += answeredSurvey;
          session.autofillFields = (session.autofillFields ?? 0) + answeredSurvey;
          session.autofillError = null;
        }
      } catch {}

      // Tự động bấm nút gửi / tiếp tục nếu có tùy chọn autoSubmit và vừa điền hoặc tích xong các trường
      if (options.autoSubmit !== false && (filledInThisPass > 0 || (session.autofillFields ?? 0) > 0)) {
        try {
          const submitBtn = await findSubmitButton(frame);
          if (submitBtn) {
            const shouldClick = await submitBtn.evaluate((btn) => {
              const now = Date.now();
              const lastClick = Number(btn.dataset.autoleadLastSubmitTime || 0);
              // Nếu vừa click trong vòng 2.5s thì không click lại để tránh duplicate submit
              if (now - lastClick < 2500) return false;
              btn.dataset.autoleadLastSubmitTime = String(now);
              btn.dataset.autoleadSubmitted = '1';
              return true;
            }).catch(() => false);

            if (shouldClick) {
              await new Promise((resolve) => { setTimeout(resolve, 800); });
              try {
                await submitBtn.click({ force: true, timeout: 2500 });
              } catch {
                await submitBtn.evaluate((btn) => btn.click()).catch(() => {});
              }

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
          }
        } catch {}
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
    const scan = async () => {
      if (filling || page.isClosed()) return;
      filling = true;
      try {
        await fillVisibleForms(page);
      } catch {
        // Trang có thể điều hướng hoặc đóng giữa hai lần quét.
      } finally {
        filling = false;
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


