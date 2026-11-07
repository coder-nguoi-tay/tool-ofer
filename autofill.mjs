import { randomInt } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { solveSurveyStep, solveSurveyCheckboxes, NONE_OF_THE_ABOVE_PATTERNS, SURVEY_LEGAL_NOISE_RE, SURVEY_NAV_NOISE_RE } from './survey-solver.mjs';
import { inspectAndFixFormWithAi } from './ai-assist.mjs';
import { rankOptions, buildOptionDecision, extractOptionFeaturesInPage } from './option-scorer.mjs';

const handledSurveyAnswerSignatures = new WeakMap();

/**
 * Copy nguyên chuỗi HTML vào clipboard hệ thống (macOS pbcopy).
 *
 * @param {string} html Nội dung HTML cần copy.
 * @return {Promise<boolean>} true nếu copy thành công.
 * @throws {never} Mọi lỗi đều được nuốt và trả về false.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-22
 */
function copyHtmlToClipboard(html) {
  return new Promise((resolve) => {
    if (!html || process.platform !== 'darwin') {
      resolve(false);
      return;
    }
    try {
      const child = spawn('pbcopy');
      child.on('error', () => resolve(false));
      child.on('close', (code) => resolve(code === 0));
      child.stdin.on('error', () => resolve(false));
      child.stdin.end(html, 'utf8');
    } catch {
      resolve(false);
    }
  });
}

/**
 * Lấy (và khởi tạo nếu chưa có) tập signature đã xử lý của một frame.
 *
 * @param {object} frame Frame Playwright.
 * @return {Set<string>} Tập signature đã được click thành công.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-20
 */
function getHandledSurveySignatures(frame) {
  let handledSignatures = handledSurveyAnswerSignatures.get(frame);
  if (!handledSignatures) {
    handledSignatures = new Set();
    handledSurveyAnswerSignatures.set(frame, handledSignatures);
  }
  return handledSignatures;
}

/**
 * Cộng số ô nhập đã điền thực sự (đã đọc lại và xác minh giá trị) vào bộ đếm "trường" của phiên.
 *
 * Chỉ dùng cho input/textarea/select/checkbox đã được xác minh. Các thao tác bấm đáp án,
 * mở offer hay submit phải dùng addActionCount để giao diện không báo sai số ô đã điền.
 *
 * @param {object|null} session Phiên browser đang chạy autofill.
 * @param {number} amount Số ô đã điền và xác minh trong lượt này (mặc định 1).
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
function addVerifiedFieldCount(session, amount = 1) {
  if (!session || !(amount > 0)) return;
  session.autofillFields = (session.autofillFields ?? 0) + amount;
}

/**
 * Cộng số thao tác không phải điền ô (bấm đáp án, mở offer, bấm submit) vào bộ đếm hành động.
 *
 * Bộ đếm này dùng để phát hiện tiến triển giữa các lượt quét, không hiển thị thành số ô đã điền.
 *
 * @param {object|null} session Phiên browser đang chạy autofill.
 * @param {number} amount Số thao tác đã thực hiện trong lượt này (mặc định 1).
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
function addActionCount(session, amount = 1) {
  if (!session || !(amount > 0)) return;
  session.autofillActions = (session.autofillActions ?? 0) + amount;
}

/**
 * Tạo mã ổn định cho câu hỏi để nhận ra cùng đáp án sau khi trang dựng lại DOM.
 *
 * @param {object} frame Frame Playwright chứa câu hỏi.
 * @param {string} questionTitle Tiêu đề câu hỏi.
 * @param {object[]} items Các lựa chọn hiển thị.
 * @return {string} Mã gồm đường dẫn trang, câu hỏi và các lựa chọn chuẩn hóa.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-20
 */
function buildSurveyAnswerSignature(frame, questionTitle, items) {
  let pagePath = '';
  try {
    const parsedUrl = new URL(frame.url());
    pagePath = `${parsedUrl.origin}${parsedUrl.pathname}`;
  } catch {}
  const normalizedQuestion = String(questionTitle ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const normalizedOptions = items.map((item) => String(item.text ?? '').replace(/\s+/g, ' ').trim().toLowerCase()).sort().join('|');
  return `${pagePath}|${normalizedQuestion}|${normalizedOptions}`;
}

/**
 * Kiểm tra một câu hỏi đã được click thành công trước đó hay chưa (không ghi nhận mới).
 *
 * @param {object} frame Frame Playwright chứa câu hỏi.
 * @param {string} signature Mã ổn định của câu hỏi và các lựa chọn.
 * @return {boolean} True nếu câu hỏi đã được xử lý trước đó.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-21
 */
function isSurveyAnswerHandled(frame, signature) {
  return getHandledSurveySignatures(frame).has(signature);
}

/**
 * GHI NHẬN một câu hỏi đã được click THÀNH CÔNG để vòng quét sau không click lại.
 * Chỉ gọi sau khi click thật sự thành công — nếu gọi trước, click hỏng sẽ khiến
 * câu hỏi bị "đánh dấu xử lý" vĩnh viễn và không bao giờ được thử lại.
 *
 * @param {object} frame Frame Playwright chứa câu hỏi.
 * @param {string} signature Mã ổn định của câu hỏi và các lựa chọn.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-21
 */
function markSurveyAnswerHandled(frame, signature) {
  const handledSignatures = getHandledSurveySignatures(frame);
  handledSignatures.add(signature);
  if (handledSignatures.size > 500) handledSignatures.delete(handledSignatures.values().next().value);
}

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
  } else if (content.includes('|')) {
    // 3. Hỗ trợ định dạng phân tách bằng dấu gạch đứng (|) tương tự file Config/Info/info.txt của tool PC
    const lines = content.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    if (!lines.length) throw new Error('Dữ liệu dạng pipe (|) không có dòng dữ liệu hợp lệ.');

    const firstCells = lines[0].split('|').map((c) => c.trim().replace(/^\uFEFF/, ''));
    const isFirstLineData = firstCells.some((c) => c.includes('@')) ||
      /^(male|female|mr|ms|mrs)$/i.test(firstCells[2] || firstCells[3] || '') ||
      /^\d{4}$/.test(firstCells[6] || '');

    const standardPipeHeaders = [
      'firstname', 'lastname', 'gender', 'title', 'birthday', 'birthmonth', 'birthyear',
      'phone', 'address', 'city', 'state', 'zipcode', 'phone2', 'username', 'password', 'email',
    ];

    let headers;
    let dataLines;
    if (isFirstLineData) {
      headers = standardPipeHeaders.slice(0, firstCells.length);
      while (headers.length < firstCells.length) {
        headers.push(`field${headers.length + 1}`);
      }
      dataLines = lines;
    } else {
      headers = firstCells;
      dataLines = lines.slice(1);
    }

    if (!dataLines.length) throw new Error('Dữ liệu tự điền cần ít nhất một bản ghi.');

    records = dataLines.map((line) => {
      const cells = line.split('|').map((c) => c.trim());
      const rec = {};
      headers.forEach((h, idx) => {
        rec[h] = cells[idx] ?? '';
      });
      return rec;
    });
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
    }
    // Không tự sinh email khi record thiếu cột email: email lấy từ danh sách email của app (assignedEmail).

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

    // 3.5. Thành phố / Thị trấn (City / Town): chuẩn hóa mọi biến thể hoặc suy ra fallback chuẩn
    const resolvedCity = normalized.city || normalized.town || normalized.cityname || normalized.city_name || normalized.shippingcity || normalized.thanhpho;
    if (resolvedCity) {
      normalized.city = resolvedCity;
      normalized.town = resolvedCity;
      normalized.cityname = resolvedCity;
    } else {
      const fallbackCity = getFallbackCity(normalized.state || normalized.stateorprovince, normalized.zipcode || normalized.zip);
      normalized.city = fallbackCity;
      normalized.town = fallbackCity;
      normalized.cityname = fallbackCity;
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

    // 5. Số điện thoại (Phone, Home Phone, Cell Phone) - mặc định đầu 814 / 817
    if (!normalized.phone) {
      normalized.phone = normalized.cellphone || normalized.homephone || normalized.workphone || '';
    }
    const normalizedPhoneVal = getNormalizedPhone(normalized);
    normalized.phone = normalizedPhoneVal;
    normalized.phonenumber = normalizedPhoneVal;
    normalized.cellphone = normalizedPhoneVal;
    normalized.areacode = getPhoneAreaCode(normalized);

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
 * Tạo một bản ghi dữ liệu mẫu đầy đủ để tự động điền form khi hàng đợi rỗng.
 *
 * @return {object} Bản ghi mẫu với tên, email, phone, zip, địa chỉ chuẩn Mỹ.
 * @throws {never} Dữ liệu mẫu được tạo cục bộ bằng các helper hiện có.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
export function createFallbackAutofillRecord() {
  const randNum = Math.floor(1000 + Math.random() * 9000);
  const firstNames = ['James', 'Robert', 'John', 'Michael', 'David', 'William', 'Richard', 'Joseph', 'Thomas', 'Charles', 'Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Barbara', 'Susan', 'Jessica', 'Sarah', 'Karen'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'];
  const fn = firstNames[Math.floor(Math.random() * firstNames.length)];
  const ln = lastNames[Math.floor(Math.random() * lastNames.length)];
  const email = `${fn.toLowerCase()}.${ln.toLowerCase()}${randNum}@gmail.com`;
  const areaCode = DEFAULT_PHONE_AREA_CODES[randomInt(0, DEFAULT_PHONE_AREA_CODES.length)];
  const phone = getNormalizedPhone({ areacode: areaCode });
  return {
    firstname: fn,
    lastname: ln,
    fullname: `${fn} ${ln}`,
    email,
    phone,
    areacode: areaCode,
    address: '4125 N Inspiration Loop',
    addressline1: '4125 N Inspiration Loop',
    streetaddress: '4125 N Inspiration Loop',
    city: 'Wasilla',
    state: 'AK',
    stateorprovince: 'AK',
    zipcode: '99654',
    zip: '99654',
    country: 'United States',
    sex: 'Male',
    age: '32',
    birthmonth: '04',
    birthday: '15',
    birthyear: '1992',
    dob: '04/15/1992',
    dateofbirth: '04/15/1992',
  };
}

/**
 * Danh sách mã vùng điện thoại mặc định cho lead (đầu 814 và 817).
 */
export const DEFAULT_PHONE_AREA_CODES = ['814', '817'];

/**
 * Lấy mã vùng điện thoại (Area Code - 3 số đầu) mặc định đầu 814 hoặc 817.
 * Nếu số điện thoại của bản ghi đã có đầu 814 hoặc 817 thì giữ nguyên;
 * ngược lại (hoặc nếu thiếu), tự động gán mặc định đầu 814 hoặc 817 nhất quán cho từng bản ghi.
 *
 * @param {object} record Bản ghi dữ liệu người dùng.
 * @return {string} Mã vùng '814' hoặc '817'.
 * @throws {never} Giá trị record sai định dạng được xử lý như số còn thiếu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
export function getPhoneAreaCode(record = {}) {
  if (record && typeof record === 'object') {
    if (record.__phoneAreaCode && DEFAULT_PHONE_AREA_CODES.includes(String(record.__phoneAreaCode))) {
      return String(record.__phoneAreaCode);
    }
    const explicitArea = String(record.areacode || record.phonearea || record.phone1 || '').replace(/\D/g, '');
    if (DEFAULT_PHONE_AREA_CODES.includes(explicitArea)) {
      record.__phoneAreaCode = explicitArea;
      return explicitArea;
    }
  }

  const raw = String(
    record?.phonenumber ||
    record?.phone ||
    record?.cellphone ||
    record?.homephone ||
    record?.workphone ||
    ''
  ).replace(/\D/g, '');
  const nationalNumber = raw.length === 11 && raw.startsWith('1') ? raw.slice(1) : raw;

  if (nationalNumber.startsWith('814')) {
    if (record && typeof record === 'object') record.__phoneAreaCode = '814';
    return '814';
  }
  if (nationalNumber.startsWith('817')) {
    if (record && typeof record === 'object') record.__phoneAreaCode = '817';
    return '817';
  }

  // Số điện thoại có sẵn nhưng không có đầu vùng 814/817: chuẩn hóa về 814 hoặc 817
  // (không phải bịa từ bên ngoài — số điện thoại đã có trong dữ liệu, chỉ cần mã vùng hợp lệ).
  const seed = String(record?.id || record?.email || record?.fullname || record?.firstname || record?.lastname || raw || '');
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const chosen = DEFAULT_PHONE_AREA_CODES[hash % DEFAULT_PHONE_AREA_CODES.length];
  if (record && typeof record === 'object') {
    record.__phoneAreaCode = chosen;
  }
  return chosen;
}

/**
 * Chuẩn hóa số điện thoại 10 chữ số của Hoa Kỳ luôn có mã vùng mặc định là 814 hoặc 817.
 * Bảo toàn định dạng ban đầu (dấu gạch nối '-', ngoặc đơn '()') nếu số gốc có định dạng.
 *
 * @param {object} record Bản ghi dữ liệu người dùng.
 * @return {string} Số điện thoại đã chuẩn hóa với đầu số 814 hoặc 817.
 */
export function getNormalizedPhone(record = {}) {
  const areaCode = getPhoneAreaCode(record);
  const raw = String(
    record?.phonenumber ||
    record?.phone ||
    record?.cellphone ||
    record?.homephone ||
    record?.workphone ||
    ''
  ).trim();

  const digits = raw.replace(/\D/g, '');

  // Thiếu số hoặc số quá ngắn: giữ đầu số 814/817, 7 số đuôi sinh ngẫu nhiên một lần cho mỗi bản ghi
  // (không dùng số cứng; lưu vào __phoneSuffix để các ô phone/prefix/line trong phiên nhất quán).
  if (digits.length < 7) {
    let suffix = record && typeof record === 'object' ? record.__phoneSuffix : null;
    if (!/^\d{7}$/.test(String(suffix || ''))) {
      suffix = `${randomInt(2, 10)}${String(randomInt(0, 1000000)).padStart(6, '0')}`;
      if (record && typeof record === 'object') record.__phoneSuffix = suffix;
    }
    return `${areaCode}${suffix}`;
  }

  // Lấy 7 chữ số cuối (3 số prefix + 4 số line number)
  const last7 = digits.length >= 10 ? digits.slice(-7) : digits.padStart(7, '9').slice(-7);

  // Giữ nguyên kiểu định dạng hiển thị của số gốc
  if (/^\(\d{3}\)\s*\d{3}-\d{4}$/.test(raw)) {
    return `(${areaCode}) ${last7.slice(0, 3)}-${last7.slice(3)}`;
  }
  if (/^\d{3}-\d{3}-\d{4}$/.test(raw)) {
    return `${areaCode}-${last7.slice(0, 3)}-${last7.slice(3)}`;
  }
  if (/^\d{3}\.\d{3}\.\d{4}$/.test(raw)) {
    return `${areaCode}.${last7.slice(0, 3)}.${last7.slice(3)}`;
  }

  // Mặc định 10 chữ số liền nhau
  return `${areaCode}${last7}`;
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
 * Bảng thành phố lớn / thủ phủ chuẩn của 50 bang Hoa Kỳ để làm giá trị dự phòng
 * tự nhiên khi dữ liệu người dùng thiếu trường thành phố (City / Town).
 */
export const usStateMajorCities = {
  AL: 'Birmingham', AK: 'Wasilla', AZ: 'Phoenix', AR: 'Little Rock', CA: 'Los Angeles',
  CO: 'Denver', CT: 'Bridgeport', DE: 'Wilmington', FL: 'Miami', GA: 'Atlanta',
  HI: 'Honolulu', ID: 'Boise', IL: 'Chicago', IN: 'Indianapolis', IA: 'Des Moines',
  KS: 'Wichita', KY: 'Louisville', LA: 'New Orleans', ME: 'Portland', MD: 'Baltimore',
  MA: 'Boston', MI: 'Detroit', MN: 'Minneapolis', MS: 'Jackson', MO: 'Kansas City',
  MT: 'Billings', NE: 'Omaha', NV: 'Las Vegas', NH: 'Manchester', NJ: 'Newark',
  NM: 'Albuquerque', NY: 'New York', NC: 'Charlotte', ND: 'Fargo', OH: 'Columbus',
  OK: 'Oklahoma City', OR: 'Portland', PA: 'Philadelphia', RI: 'Providence', SC: 'Charleston',
  SD: 'Sioux Falls', TN: 'Nashville', TX: 'Houston', UT: 'Salt Lake City', VT: 'Burlington',
  VA: 'Virginia Beach', WA: 'Seattle', WV: 'Charleston', WI: 'Milwaukee', WY: 'Cheyenne',
  DC: 'Washington',
};

/**
 * Trả về thành phố fallback hợp lệ theo bang (state) hoặc mã bưu điện (zip).
 * Tuyệt đối không để trường City/Town bị rỗng hoặc rơi xuống các nhánh số điện thoại.
 *
 * @param {string} [state=''] Tên hoặc mã viết tắt của bang.
 * @param {string} [zip=''] Mã zip bưu điện (nếu có).
 * @return {string} Tên thành phố hợp lệ chuẩn Mỹ.
 */
export function getFallbackCity(state = '', zip = '') {
  const cleanState = String(state || '').trim();
  if (cleanState) {
    const upper = cleanState.toUpperCase();
    if (usStateMajorCities[upper]) return usStateMajorCities[upper];
    const lower = cleanState.toLowerCase();
    const code = usStateCodes[lower];
    if (code && usStateMajorCities[code]) return usStateMajorCities[code];
  }

  // Tra cứu sơ bộ theo đầu số zipcode Mỹ nếu state không nhận diện được
  const cleanZip = String(zip || '').replace(/\D/g, '').slice(0, 5);
  if (cleanZip) {
    const p2 = parseInt(cleanZip.slice(0, 2), 10);
    if (p2 === 99) return 'Wasilla';
    if (p2 >= 32 && p2 <= 34) return 'Miami';
    if (p2 >= 90 && p2 <= 96) return 'Los Angeles';
    if (p2 >= 75 && p2 <= 79) return 'Houston';
    if (p2 >= 10 && p2 <= 14) return 'New York';
    if (p2 >= 60 && p2 <= 62) return 'Chicago';
    if (p2 >= 30 && p2 <= 31) return 'Atlanta';
    if (p2 >= 98 && p2 <= 99) return 'Seattle';
  }

  return 'Wasilla';
}

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
    resolve: (r) => getPhoneAreaCode(r),
  },
  {
    type: 'phone_prefix',
    patterns: [/^(prefix|phone2|tel2|phoneprefix)$/],
    resolve: (r) => {
      const phone = getNormalizedPhone(r);
      if (!phone) return null;
      const digits = phone.replace(/\D/g, '');
      return digits.length >= 6 ? digits.slice(3, 6) : null;
    },
  },
  {
    type: 'phone_line',
    patterns: [/^(line|linenumber|phone3|tel3|phoneline)$/],
    resolve: (r) => {
      const phone = getNormalizedPhone(r);
      if (!phone) return null;
      const digits = phone.replace(/\D/g, '');
      return digits.length >= 10 ? digits.slice(6, 10) : null;
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
    patterns: [/^ssn3$/, /ssn.*last4/, /last4.*ssn/, /^last4$/, /^ssn4$/, /ssn_last_4/, /last_4/],
    resolve: (r) => {
      const ssn = (r.ssn || '').replace(/\D/g, '');
      if (ssn.length >= 9) return ssn.slice(5, 9);
      if (r.ssn_last4) return String(r.ssn_last4).slice(-4);
      // Fallback: lấy 4 số cuối của số điện thoại có sẵn trong dữ liệu (không dùng số tự sinh)
      const rawDigits = String(r.phonenumber || r.phone || r.cellphone || r.homephone || r.workphone || '').replace(/\D/g, '');
      if (rawDigits.length < 7) return null;
      const digits = getNormalizedPhone(r).replace(/\D/g, '');
      return digits.length >= 10 ? digits.slice(6, 10) : null;
    },
  },
  // 4. Các trường họ tên
  {
    type: 'first_name',
    patterns: [/^(first|fname|given|forename)/, /^ten$/, /firstname/, /^fn$/],
    resolve: (r) => {
      if (r.firstname || r.fname) return r.firstname || r.fname;
      if (r.fullname) return r.fullname.trim().split(/\s+/)[0];
      const email = r.email || r.emailaddress || '';
      if (email && email.includes('@')) {
        const local = email.split('@')[0];
        const parts = local.split(/[._\d-]+/).filter(Boolean);
        if (parts.length > 0 && parts[0].length >= 2) {
          return parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
        }
      }
      return 'James';
    },
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
    patterns: [/^(last|lname|sur|family)/, /^ho$/, /lastname/, /^ln$/],
    resolve: (r) => {
      if (r.lastname || r.lname) return r.lastname || r.lname;
      if (r.fullname) return r.fullname.trim().split(/\s+/).slice(1).join(' ') || r.fullname;
      const email = r.email || r.emailaddress || '';
      if (email && email.includes('@')) {
        const local = email.split('@')[0];
        const parts = local.split(/[._\d-]+/).filter(Boolean);
        if (parts.length > 1 && parts[1].length >= 2) {
          return parts[1].charAt(0).toUpperCase() + parts[1].slice(1).toLowerCase();
        }
      }
      return 'Smith';
    },
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
    resolve: (r) => getNormalizedPhone(r),
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
      // Không tự sinh email: chỉ dùng email trong danh sách app cung cấp (hết thì để trống).
      return null;
    },
  },
  // 8. SSN gộp
  {
    type: 'ssn',
    patterns: [/ssn/, /socialsecurity/, /^social$/],
    resolve: (r) => {
      // Chỉ dùng SSN có trong dữ liệu, không tự ghép từ số điện thoại.
      return r.ssn || r.socialsecurity || null;
    },
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
    patterns: [/city/, /town/, /thanhpho/, /^ct$/],
    resolve: (r) => r.city || r.town || r.thanhpho || getFallbackCity(r?.state, r?.zipcode),
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
      return null;
    },
  },
  // Title (Mr./Ms./Mrs.): ưu tiên data có title/gender; thiếu thì đoán theo cột
  // gender của bản ghi — không có gì hết thì xoay theo đầy đủ first name hash
  // để các lần chạy không lệ cố định một giá trị.
  {
    type: 'person_title',
    patterns: [/^title$/, /^title_?select$/, /^salutation$/, /^prefix$/, /^mr\b|^mrs\b|^ms\b/],
    resolve: (r) => {
      if (r.title) {
        const t = String(r.title).trim();
        if (/^m(r|rs|s)\.?$/i.test(t) || /^(mr|ms|mrs|male|female|nam|nu)$/i.test(t)) {
          if (/^(mrs|ms|f|female|nu)$/i.test(t)) return 'Female';
          if (/^(mr|m|male|nam)$/i.test(t)) return 'Male';
          return t;
        }
      }
      const g = r.gender || r.sex || r.gioitinh || '';
      if (g) {
        if (/^f(emale)?$|^nu$|^mrs$|^ms$/i.test(g)) return 'Female';
        if (/^m(ale)?$|^nam$|^mr$/i.test(g)) return 'Male';
      }
      const first = String(r.firstname || r.first_name || (r.fullname || '').split(/\s+/)[0] || '');
      const last = String(r.lastname || r.last_name || (r.fullname || '').split(/\s+/).slice(-1)[0] || '');
      const hash = (first + last).replace(/[^a-z]/gi, '').length || String(r.fullname || '').length;
      return hash % 2 === 0 ? 'Male' : 'Female';
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
  // 11. Thu nhập & Tài chính (Smart Contextual Defaults)
  {
    type: 'income',
    patterns: [/income/, /salary/, /earnings/, /household.*income/, /annual.*income/, /wage/, /thunhap/],
    resolve: (r) => r.income || r.salary || r.household_income || r.annual_income || null,
  },
  {
    type: 'debt',
    patterns: [/debt/, /unsecured_debt/, /credit_card_debt/, /tax_debt/, /sotienno/],
    resolve: (r) => r.debt || r.debt_amount || null,
  },
  {
    type: 'credit_score',
    patterns: [/credit.*score/, /credit.*rating/, /credit_grade/, /diemtindung/],
    resolve: (r) => r.credit_score || r.credit || null,
  },
  {
    type: 'loan_amount',
    patterns: [/loan.*amount/, /borrow_amount/, /desired_loan/, /vay/],
    resolve: (r) => r.loan_amount || null,
  },
  // 12. Nhà ở & Công việc (Housing & Employment)
  {
    type: 'homeowner',
    patterns: [/homeowner/, /own.*rent/, /rent.*own/, /housing/, /residence_type/, /nha_o/],
    resolve: (r) => r.homeowner || r.housing || null,
  },
  {
    type: 'employment_status',
    patterns: [/employment/, /work_status/, /job_status/, /vieclam/, /nghenghiep/],
    resolve: (r) => r.employment || r.employment_status || null,
  },
  {
    type: 'employer',
    patterns: [/employer/, /company_name/, /congty/, /noi_lam_viec/],
    resolve: (r) => r.employer || r.company || null,
  },
  {
    type: 'job_title',
    patterns: [/job_title/, /jobtitle/, /occupation/, /chucvu/, /position/],
    resolve: (r) => r.job_title || r.occupation || null,
  },
  {
    type: 'education',
    patterns: [/education/, /degree/, /school_level/, /trinhdo/, /hocvan/],
    resolve: (r) => r.education || null,
  },
  {
    type: 'years_at_address',
    patterns: [/years.*address/, /time.*address/, /residence_years/, /sonam_o/],
    resolve: (r) => r.years_at_address || null,
  },
  {
    type: 'months_at_address',
    patterns: [/months.*address/, /residence_months/, /sothang_o/],
    resolve: (r) => r.months_at_address || null,
  },
  {
    type: 'monthly_rent',
    patterns: [/monthly.*rent/, /mortgage.*payment/, /rent_payment/, /tiennha/],
    resolve: (r) => r.rent || r.monthly_rent || null,
  },
  // 13. Phương tiện & Cá nhân (Vehicle & Personal)
  {
    type: 'vehicle_year',
    patterns: [/vehicle.*year/, /car.*year/, /auto.*year/, /namsanxuat/],
    resolve: (r) => r.vehicle_year || r.car_year || null,
  },
  {
    type: 'vehicle_make',
    patterns: [/vehicle.*make/, /car.*make/, /auto.*make/, /hangxe/],
    resolve: (r) => r.vehicle_make || r.car_make || null,
  },
  {
    type: 'vehicle_model',
    patterns: [/vehicle.*model/, /car.*model/, /auto.*model/, /dongxe/],
    resolve: (r) => r.vehicle_model || r.car_model || null,
  },
  {
    type: 'marital_status',
    patterns: [/marital/, /honnhan/, /married/, /^status$/],
    resolve: (r) => r.marital_status || null,
  },
  {
    type: 'military',
    patterns: [/military/, /veteran/, /armed.*forces/, /quandong/],
    resolve: (r) => r.military || null,
  },
  {
    type: 'weight',
    patterns: [/^weight$/, /weight_lbs/, /body_weight/, /cannang/],
    resolve: (r) => r.weight || null,
  },
  {
    type: 'height_feet',
    patterns: [/height.*feet/, /^feet$/],
    resolve: (r) => r.height_feet || null,
  },
  {
    type: 'height_inches',
    patterns: [/height.*inches/, /^inches$/],
    resolve: (r) => r.height_inches || null,
  },
  {
    type: 'height',
    patterns: [/^height$/, /chieucao/],
    resolve: (r) => r.height || null,
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
  if (value === null || value === undefined) return null;
  let val = String(value).trim();
  const maxLen = Number(metadata.maxLength);
  if (Number.isInteger(maxLen) && maxLen > 0 && val.length > maxLen) {
    const digitsOnly = val.replace(/\D/g, '');
    if (digitsOnly.length === maxLen) {
      val = digitsOnly;
    } else if (digitsOnly.length > maxLen) {
      val = digitsOnly.slice(0, maxLen);
    } else {
      val = val.slice(0, maxLen);
    }
  }

  // Tự động bảo đảm Email luôn có domain hợp lệ (@gmail.com) nếu thiếu ký tự @.
  // FIX "Mailing Address": chỉ coi là email khi metadata.type==='email' HOẶC có candidate
  // thật sự là tên email — và KHÔNG có tên địa chỉ nào khác trong cùng ô,
  // tránh nối @gmail.com vào địa chỉ đường (123 Main Street Apt 4@gmail.com).
  const candidates = metadata.names || [];
  const isAddressName = (n) => /address|street|addr|apt|suite|unit/i.test(n) && !/e-?mail/i.test(n);
  const addressHints = [...candidates, metadata.name, metadata.id, metadata.placeholder, metadata.ariaLabel, metadata.label];
  const isEmailVal = metadata.type === 'email' || (candidates.some(isEmailFieldName) && !addressHints.some(isAddressName));
  if (isEmailVal && val && !val.includes('@')) {
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
  if (/mail/i.test(norm) && !/address|street|diachi|box|list|city|town|state|zip|postal/i.test(norm)) return true;
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
  // Lọc chỉ giữ các candidate thực sự là tên trường (bỏ các chuỗi văn bản dài > 60 ký tự)
  const normalizedCandidates = candidateNames
    .filter((n) => typeof n === 'string' && n.trim().length > 0 && n.trim().length <= 60)
    .map(normalizeFieldName)
    .filter((n) => n.length > 0 && n.length <= 40);

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
  const isExplicitAge = candidateNames.some((n) => typeof n === 'string' && /(^|[^a-z])(age|tuoi)([^a-z]|$)/i.test(n) && n.length <= 60);
  const blockPhone = isExplicitAddress || isExplicitZip || isExplicitCity || isExplicitState || isExplicitAge;

  if (metadata.type === 'email' && !normalizedCandidates.includes('email')) {
    normalizedCandidates.unshift('email');
  }
  // Chỉ đẩy 'phone' khi KHÔNG phải trường địa chỉ/zip/city/state
  if (metadata.type === 'tel' && !blockPhone && !normalizedCandidates.some((c) => c.includes('phone') || c.includes('tel')) && !normalizedCandidates.some((c) => /zip|postal|code/i.test(c))) {
    normalizedCandidates.unshift('phone');
  }
  if (normalizedCandidates.some((c) => /^(zip|postal|postcode|zippost|zp)$/i.test(c)) && !normalizedCandidates.includes('zipcode')) {
    normalizedCandidates.unshift('zipcode', 'zip');
  }

  if (!normalizedCandidates.length) return null;

  // Email chỉ xác định khi kiểu input là email, hoặc candidate có chữ "email" thật sự,
  // HOẶC candidate là "mail" ĐỘC LẬP mà trường đó KHÔNG phải địa chỉ (zip/address).
  const candidatesEmailName = normalizedCandidates.some(isEmailFieldName);
  const isExplicitEmail = metadata.type === 'email'
    || normalizedCandidates.some((c) => c.includes('email'))
    || (candidatesEmailName && !isExplicitAddress && !isExplicitZip && !allText.includes('address'));
  const isEmailField = isExplicitEmail;
  const assignedEmail = metadata.assignedEmail || record.assignedEmail;
  const isExplicitName = normalizedCandidates.some((c) => /^(firstname|lastname|fname|lname|fullname|first|last|name|fn|ln)$/i.test(c)) ||
    (metadata.name && /firstname|lastname|fname|lname|^fn$|^ln$/i.test(metadata.name)) ||
    (metadata.id && /firstname|lastname|fname|lname|^fn$|^ln$/i.test(metadata.id));
  const isExplicitDob = normalizedCandidates.some((c) => /^(dob|birthdate|dateofbirth|birthday|bday|namsinh|ngaysinh)$/i.test(c));

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
  if (isExplicitAddress && !normalizedCandidates.some((c) => /address2|apt|suite|unit/i.test(c))) {
    const addr = getAddressString(record) || record.address || record.address1 || record.addressline1 || record.streetaddress || record.street;
    if (addr) return formatMatchedValue(addr, metadata);
  }

  // Ưu tiên 3: Mã bưu chính (Zip Code)
  if (isExplicitZip) {
    const zipVal = record.zipcode || record.zip || record.ziporpostcode || record.ziporpostalcode || record.postalcode || record.postcode || record.postal;
    if (zipVal) {
      const cleanZip = String(zipVal).replace(/\D/g, '');
      const finalZip = (cleanZip.length >= 5) ? cleanZip.slice(0, 5) : String(zipVal).trim();
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
    const isPhoneAreaField = normalizedCandidates.some((c) => /^(areacode|phone1|tel1|phonearea)$/i.test(c));
    if (isPhoneAreaField) {
      return formatMatchedValue(getPhoneAreaCode(record), metadata);
    }

    const isPhonePrefixField = normalizedCandidates.some((c) => /^(prefix|phone2|tel2|phoneprefix)$/i.test(c));
    if (isPhonePrefixField) {
      const prefixPhone = getNormalizedPhone(record);
      if (!prefixPhone) return null;
      const digits = prefixPhone.replace(/\D/g, '');
      if (digits.length < 6) return null;
      return formatMatchedValue(digits.slice(3, 6), metadata);
    }

    const isPhoneLineField = normalizedCandidates.some((c) => /^(line|linenumber|phone3|tel3|phoneline)$/i.test(c));
    if (isPhoneLineField) {
      const phone = getNormalizedPhone(record);
      if (!phone) return null;
      const digits = phone.replace(/\D/g, '');
      if (digits.length < 10) return null;
      return formatMatchedValue(digits.slice(6, 10), metadata);
    }

    const isFullPhoneField = (metadata.type === 'tel' && !isExplicitZip && !isExplicitCity && !isExplicitAddress && !isExplicitState && !isExplicitDob && !blockPhone) || normalizedCandidates.some((c) =>
      /^(phone|phonenumber|telephone|telephone_two|mobile|mobilenumber|cell|cellphone|contactphone|userphone|primaryphone|dayphone|eveningphone|homephone|workphone|sdt|dienthoai|tl)$/i.test(c) ||
      (/phone|mobile|cell|^tel(ephone)?(_two)?$|^sdt$|dienthoai|^tl$/i.test(c) && !/^(areacode|phone1|tel1|prefix|phone2|tel2|line|phone3|tel3)$/i.test(c) && !/microphone|headphone|earphone|address|street|addr|apt|suite|unit|zip|postal|postcode|city|town|email|name/i.test(c))
    );
    if (isFullPhoneField) {
      const phone = getNormalizedPhone(record);
      if (!phone) return null;
      return formatMatchedValue(phone, metadata);
    }
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
    // Không tự sinh email: chỉ dùng email trong danh sách app cung cấp (hết thì để trống).
    return null;
  }

  // 5. Fallback đặc biệt cho Zip Code: nếu form có ô mã bưu chính
  if (normalizedCandidates.some((c) => /zip|postal|postcode/.test(c))) {
    const zipVal = record.zipcode || record.zip || record.ziporpostcode || record.ziporpostalcode || record.postalcode || record.postcode || record.postal;
    // Chỉ dùng zip có trong dữ liệu, không tra bảng zip mặc định theo bang.
    if (zipVal) return formatMatchedValue(zipVal, metadata);
    return null;
  }

  // 6. Fallback đặc biệt cho Địa chỉ: nếu form có ô địa chỉ (address, street, streetaddress, address1)
  if (normalizedCandidates.some((c) => /address|street|diachi|^addr/i.test(c)) && !normalizedCandidates.some((c) => /address2|apt|suite|unit/i.test(c))) {
    const addr = getAddressString(record) || record.address || record.address1 || record.addressline1 || record.streetaddress || record.street;
    // Chỉ dùng dữ liệu đã cung cấp, không tự bịa địa chỉ ngoài record.
    if (addr) return formatMatchedValue(addr, metadata);
    return null;
  }

  // 6b. Fallback cho ô họ tên có id/name/label lạ (contactName, applicantFullName...): không để rơi xuống giá trị 'Yes'
  const nameCandidate = normalizedCandidates.find((c) => /name|^fn$|^ln$/.test(c)
    && !/(user|company|business|file|bank|card|street|city|state|nick|domain|host|display|school|pet|product)/.test(c));
  if (nameCandidate) {
    const fullNameVal = record.fullname || `${record.firstname || ''} ${record.lastname || ''}`.trim();
    let nameVal = null;
    if (/first|given|fore|fname|^fn$/.test(nameCandidate)) {
      nameVal = record.firstname || record.fname || (fullNameVal ? fullNameVal.split(/\s+/)[0] : null);
      if (!nameVal) {
        const email = record.email || record.emailaddress || '';
        const parts = email.split('@')[0]?.split(/[._\d-]+/).filter(Boolean) || [];
        nameVal = parts[0] ? (parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase()) : 'James';
      }
    } else if (/last|sur|family|lname|^ln$/.test(nameCandidate)) {
      nameVal = record.lastname || record.lname || (fullNameVal ? fullNameVal.split(/\s+/).slice(1).join(' ') || fullNameVal : null);
      if (!nameVal) {
        const email = record.email || record.emailaddress || '';
        const parts = email.split('@')[0]?.split(/[._\d-]+/).filter(Boolean) || [];
        nameVal = parts[1] ? (parts[1].charAt(0).toUpperCase() + parts[1].slice(1).toLowerCase()) : 'Smith';
      }
    } else if (/middle|mname/.test(nameCandidate)) {
      nameVal = record.middlename || record.middleinitial || record.mname || null;
    } else {
      nameVal = fullNameVal || 'James Smith';
    }
    if (nameVal) return formatMatchedValue(nameVal, metadata);
  }

  // 7. Universal Smart Fallback cho các ô BẮT BUỘC (required): không để ô bắt buộc bị trống khiến form bị nghẽn
  if (metadata.required || metadata.ariaRequired || metadata.isRequired) {
    if (metadata.type === 'number' || metadata.type === 'range') {
      const maxLen = Number(metadata.maxLength);
      if (maxLen === 4) return '2020';
      if (maxLen === 2) return '25';
      if (maxLen === 1) return '1';
      return '1000';
    }
    if (metadata.type === 'tel') {
      const phone = getNormalizedPhone(record);
      return phone ? formatMatchedValue(phone, metadata) : null;
    }
    if (metadata.type === 'email') {
      // Không tự sinh email: chỉ dùng email trong danh sách app cung cấp (hết thì để trống).
      return null;
    }
    if (metadata.kind === 'textarea') {
      return 'Interested in learning more information.';
    }
    // Ô text bắt buộc không có trong dữ liệu: để trống (không bịa giá trị ngoài record)
    return null;
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
  const textContent = `${names.join(' ')} ${id} ${name} ${classes}`;
  const dataAttributes = metadata.dataAttributes || {};

  // 1. Checkbox có thuộc tính required hoặc aria-required hoặc data-required
  if (metadata.required || metadata.ariaRequired === 'true' || metadata.isRequired || metadata.dataAttributes?.['data-required'] === 'true') {
    return true;
  }

  // 2. Kiểm tra ID hoặc name
  if (/digitalconsent|consent|disclosure|agree|terms|tcpa|optin|opt_in|privacy|policy|acknowledge|tos|rules|accept|confirm|legal|disclaimer|certify|authorize|authorization|sms|communication|comm|marketing|partner|offer|lead|resident|citizen|age|subscriber|subscribe|continue|proceed|must/i.test(`${id} ${name}`)) {
    return true;
  }

  // 3. Kiểm tra data- attributes (ví dụ: data-tf-element-role="consent-opt-in", data-leadid-type="disclosure")
  for (const [key, val] of Object.entries(dataAttributes)) {
    const keyLower = String(key).toLowerCase();
    const valLower = String(val).toLowerCase();
    if (/consent|disclosure|agree|accept|tcpa|terms|privacy|policy|legal|required|optin|continue|must/i.test(`${keyLower} ${valLower}`)) {
      return true;
    }
  }

  // 4. Kiểm tra class hoặc container class (ví dụ: .consent-box, .consent-row, .terms-check)
  if (/consent|disclosure|tcpa|terms|privacy|policy|agree|accept|checkbox-terms|legal|required|mandatory|must/i.test(classes)) {
    return true;
  }

  // 5. Kiểm tra văn bản nhãn / mô tả đi kèm (ví dụ: "You must accept to continue", "By clicking Continue...", v.v.)
  if (/accept|agree|consent|terms|tcpa|privacy|policy|disclosure|must\s*(?:accept|agree|check|confirm|be)|you\s*must|required|mandatory|i\s*represent|18\+|certify|acknowledge|authorize|understand|by\s*checking|by\s*clicking|continue|proceed|resident|citizen|subscriber|opt-?in|electronic\s*signature|e-sign|automated\s*technology|sms|text\s*message|receive\s*offers|điều\s*khoản|chính\s*sách|đồng\s*ý|chấp\s*nhận|xác\s*nhận/i.test(textContent)) {
    return true;
  }

  return false;
}

/**
 * Chiều cao vùng quét nút gửi, tính theo số lần `innerHeight` kể từ đỉnh trang (1 = chỉ màn hình đầu tiên).
 * Nút nằm ngoài vùng này (footer, link cuối trang...) bị bỏ qua.
 *
 * @type {number}
 */
export const SUBMIT_SCAN_VIEWPORTS = 1;

/**
 * Tìm nút gửi (Submit / Continue / Next) trên trang hoặc frame.
 * Chỉ xét nút nằm trong vùng `SUBMIT_SCAN_VIEWPORTS` màn hình đầu tiên của trang.
 *
 * @param {object} frame Frame hoặc Page của Playwright.
 * @return {Promise<object|null>} Locator của nút submit hoặc null nếu không tìm thấy.
 * @throws {never} Lỗi locator được xử lý tại từng selector.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
export async function findSubmitButton(frame) {
  const candidateSelectors = [
    // 1. Nút Submit / Continue theo data- attributes chuẩn của Funnel, Vector & Lead forms (chỉ chọn thẻ tương tác, không chọn generic container)
    '#sub-btn, div#sub-btn, .sbtn, div.sbtn, div#sub-btn.sbtn',
    '[data-action="email-continue"], [data-action="continue"], [data-action*="continue"], div.btn[data-action="email-continue"], div[role="button"][data-action="email-continue"]',
    'button[data-vector-submit="true"], button[data-vector-submit], a[data-vector-submit="true"], a[data-vector-submit], input[data-vector-submit="true"], [role="button"][data-vector-submit="true"]',
    'button[data-tf-element-role="submit"], a[data-tf-element-role="submit"], [role="button"][data-tf-element-role="submit"]',
    'button#submit-button, a#submit-button, input#submit-button, button#btn-submit, button#submit-btn, button#submit, button#continue, button#btnSubmit, button#btnNext, button#btnContinue, a#btn-submit, a#continue, a#btnSubmit, input#btnSubmit',
    'button.ai-submit-button, button.ai-submit-button--question, button.ai-submit-button--multiselect, button.ai-submit-button--form, button[data-testid="ai-submit-button"], button.ai-button--submit, button[class*="ai-submit-button"], .ai-submit-button, button.submit-button, button[id^="ct-creative-submit-"], a[id^="ct-creative-submit-"], .ct-creative-submit, button[data-mock-action="next-page"]',

    // 2. Thẻ submit tiêu chuẩn của HTML (bao gồm nút mặc định submit trong thẻ form)
    'button[type="submit"]',
    'input[type="submit"]',
    'form button:not([type="button"]):not([type="reset"])',
    'form button[type="submit"]',
    'form input[type="submit"]',
    'input[type="button"][value*="Continue" i], input[type="button"][value*="Submit" i], input[type="button"][value*="Next" i]',

    // 3. Nút bấm theo class phổ biến (bao gồm Jump Page, CTA button màn 5, màn Reward, LocoTomato Widget, div.button, .btn-option)
    'button.continue-btn, button.continue-button, button.submit-btn, button.btn-submit, button.btn-continue, button.btn-next, button.next-btn, button.next-button, button.btn-primary, button.arc-confirm-btn, button.blue-button, button.track-button, button.step-submit, button.forward-btn, button.btn-step, button.cta-button, button.rjp-cta-button, button.sjp-cta-button, button.cta-btn',
    '#twy-buttonnext, [id^="twy-buttonnext-"], .twy-buttonnext, .Buttons .Next a, a.Next, .Buttons a.Next, .thankyou-button, .thankyou-actions a',
    'button.loco-btn, button.loco-submit, button.loco-next, button[data-loco-role="submit"], button[data-loco-action="submit"], a.loco-btn, a.loco-submit, .loco-submit-btn, .loco-btn-primary, [data-loco-role="submit"]',
    'form button.btn, form button.button, form button[class*="primary"], form button[class*="submit"], form button[class*="continue"]',
    'a.continue-btn, a.continue-button, a.submit-btn, a.btn-submit, a.btn-continue, a.btn-next, a.next-btn, a.button-next, a.btn-primary, a.arc-confirm-btn, a.forward-step, a.cta-button, a.rjp-cta-button, a.sjp-cta-button, a.cta-btn',
    '[role="button"].continue-btn, [role="button"].continue-button, [role="button"].btn-continue, [role="button"].btn-next, [role="button"].next-btn, [role="button"].btn-primary, [role="button"].cta-button, [role="button"].rjp-cta-button',
    'div.continue-btn, div.continue-button, div.btn-continue, div.btn-next, div.next-btn, div.submit-btn, div.button-next, div.forward-step, .cta-button, .rjp-cta-button, .sjp-cta-button',
    'div.btn-option, div.button, div.btn, div.inut, div.input, [id="btn-option"], [id^="btn-option"], [id*="btn-option"], .btn-option, button.btn-option, a.btn-option',
    'a[href*="/next"], a[aria-label*="Reward" i], a[aria-label*="Get My" i], a[aria-label*="Continue" i], a[aria-label*="Claim" i], button[aria-label*="Reward" i], button[aria-label*="Get My" i]',

    // 4. Nút bấm theo text phổ biến (tiếng Anh & tiếng Việt, bao gồm Jump Page Get My Reward, Free Guide của LocoTomato)
    'button:has-text("Continue"), button:has-text("Submit"), button:has-text("Next"), button:has-text("Agree & Submit"), button:has-text("AGREE & CONTINUE"), button:has-text("Agree & Continue"), button:has-text("Tiếp tục"), button:has-text("Get Quote"), button:has-text("Get My Quote"), button:has-text("Agree"), button:has-text("Tiếp theo"), button:has-text("Xác nhận"), button:has-text("Get Started"), button:has-text("See My Results"), button:has-text("View My Results"), button:has-text("Check My Rate"), button:has-text("Claim Now"), button:has-text("Proceed"), button:has-text("Finish"), button:has-text("Complete"), button:has-text("Explore Plans"), button:has-text("Check Options"), button:has-text("Hoàn thành"), button:has-text("Get My Reward"), button:has-text("Claim Reward"), button:has-text("Claim My Reward"), button:has-text("Get Reward"), button:has-text("Unlock Reward"), button:has-text("View Deals"), button:has-text("Continue to Deals"), button:has-text("View Offers"), button:has-text("See Offers"), button:has-text("Check Eligibility"), button:has-text("See Matches"), button:has-text("Show Matches"), button:has-text("Send"), button:has-text("Sign Up"), button:has-text("Sign-Up"), button:has-text("Sign Up Now"), button:has-text("Register"), button:has-text("Register Now"), button:has-text("Join Now"), button:has-text("Join Free"), button:has-text("Enter Now"), button:has-text("Enter to Win"), button:has-text("Start Now"), button:has-text("Apply Now"), button:has-text("Start"), button:has-text("Free Quote"), button:has-text("Request Quote"), button:has-text("Next Step"), button:has-text("Take Survey"), button:has-text("Confirm"), button:has-text("Get Free Guide"), button:has-text("Get My Free Guide"), button:has-text("Get Guide"), button:has-text("Get Guide Now"), button:has-text("Get Cash Assistance"), button:has-text("Free Guide")',
    'a:has-text("Continue"), a:has-text("Submit"), a:has-text("Next"), a:has-text("Agree & Submit"), a:has-text("AGREE & CONTINUE"), a:has-text("Tiếp tục"), a:has-text("Get Quote"), a:has-text("Agree"), a:has-text("Get Started"), a:has-text("See My Results"), a:has-text("Claim Now"), a:has-text("Proceed"), a:has-text("Complete"), a:has-text("Explore Plans"), a:has-text("Get My Reward"), a:has-text("Claim Reward"), a:has-text("Claim My Reward"), a:has-text("Get Reward"), a:has-text("Unlock Reward"), a:has-text("View Deals"), a:has-text("Continue to Deals"), a:has-text("View Offers"), a:has-text("See Offers"), a:has-text("Check Eligibility"), a:has-text("See Matches"), a:has-text("Sign Up"), a:has-text("Sign-Up"), a:has-text("Sign Up Now"), a:has-text("Register"), a:has-text("Register Now"), a:has-text("Join Now"), a:has-text("Enter Now"), a:has-text("Apply Now"), a:has-text("Start"), a:has-text("Take Survey"), a:has-text("Get Free Guide"), a:has-text("Get My Free Guide"), a:has-text("Get Guide"), a:has-text("Get Guide Now"), a:has-text("Get Cash Assistance"), a:has-text("Free Guide")',
    '[role="button"]:has-text("Continue"), [role="button"]:has-text("Submit"), [role="button"]:has-text("Next"), [role="button"]:has-text("Agree & Submit"), [role="button"]:has-text("Agree"), [role="button"]:has-text("Tiếp tục"), [role="button"]:has-text("Get Started"), [role="button"]:has-text("See My Results"), [role="button"]:has-text("Get My Reward"), [role="button"]:has-text("Claim Reward"), [role="button"]:has-text("Get Reward"), [role="button"]:has-text("Check Eligibility"), [role="button"]:has-text("Sign Up"), [role="button"]:has-text("Register"), [role="button"]:has-text("Join Now"), [role="button"]:has-text("Get Free Guide"), [role="button"]:has-text("Get Guide")',
    'button[id*="submit" i], button[id*="continue" i], button[id*="next" i], a[id*="submit" i], a[id*="continue" i], a[id*="next" i]',
    'button[class*="submit" i], button[class*="continue" i], button[class*="next" i], a[class*="submit" i], a[class*="continue" i], a[class*="next" i]',
    'div[class*="btn"]:has-text("Continue"), div[class*="button"]:has-text("Continue"), div[class*="btn"]:has-text("Next"), div[class*="button"]:has-text("Next"), span[class*="btn"]:has-text("Continue")',
    'form button:not([type="reset"])',
  ];

  for (const selector of candidateSelectors) {
    try {
      const candidates = await frame.locator(selector).all();
      for (const btn of candidates) {
        if (!(await btn.isVisible().catch(() => false))) continue;

        // Xác thực phần tử nút bấm: loại trừ tuyệt đối IFRAME, FORM hoặc container DIV lớn
        const validation = typeof btn.evaluate === 'function' ? await btn.evaluate((el, maxViewports) => {
          const tag = (el.tagName || 'BUTTON').toUpperCase();
          // Không ép nút đang xử lý request (disabled/loading) chạy lại: snapshot
          // SweepstakesAlerts cho thấy #newsletter-submit đổi thành "Submitting...".
          if (el.disabled || el.getAttribute?.('aria-disabled') === 'true' || el.getAttribute?.('aria-busy') === 'true') {
            return { valid: false, reason: 'disabled_or_busy' };
          }
          if (el.id === 'newsletter-submit' && /submitting/i.test(el.textContent || '')) {
            return { valid: false, reason: 'newsletter_submitting' };
          }
          if (['IFRAME', 'FRAME', 'FORM', 'BODY', 'HTML', 'MAIN', 'SECTION', 'ARTICLE'].includes(tag)) {
            return { valid: false, reason: 'container_tag' };
          }
          if (el.closest?.('form[role="search"], form:has(input[type="search"][name="q"])')) {
            return { valid: false, reason: 'site_search_form' };
          }

          // Bỏ qua các nút thuộc Offerwall Cards để nhường quyền xử lý cho handleOfferwallCards
          if (
            (typeof el.closest === 'function' && el.closest('.offerwall-card, form[data-tf-element-role="offer"], .offerwall-card-wrap')) ||
            (el.classList && typeof el.classList.contains === 'function' && el.classList.contains('offerwall-btn')) ||
            (typeof el.getAttribute === 'function' && el.getAttribute('data-tf-element-role') === 'offer-btn')
          ) {
            return { valid: false, reason: 'offerwall' };
          }

          // Kiểm tra kích thước hình học nếu có: nút bấm không thể quá nhỏ hoặc quá khổng lồ (hỗ trợ nút full-width lên đến 1400px trên desktop)
          const rect = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null;
          if (rect) {
            if (rect.width <= 4 || rect.height <= 4) return { valid: false, reason: 'zero_size' };
            if (rect.height > 250 || rect.width > 1400) return { valid: false, reason: 'too_large' };
            // Chỉ nhận nút ở đoạn đầu trang (màn hình đầu tiên), bỏ qua nút nằm sâu phía dưới.
            if (rect.top + (window.scrollY || 0) > (window.innerHeight || 0) * maxViewports) return { valid: false, reason: 'below_first_screen' };
          }

          const text = (el.innerText || el.value || el.textContent || '').trim().toLowerCase();
          const href = (el.getAttribute && typeof el.getAttribute === 'function' ? el.getAttribute('href') : '') || '';
          const idAndClass = `${el.id || ''} ${el.className || ''}`.toLowerCase();

          // 1. Kiểm tra từ khóa pháp lý / chân trang / link điều khoản
          const legalNoise = /privacy|terms|condition|policy|disclaimer|cookie|copyright|all rights reserved|do not sell|opt[- ]?out|unsubscribe|dmca|legal|disclosure/i;
          if (legalNoise.test(text) || legalNoise.test(href) || legalNoise.test(idAndClass)) {
            return { valid: false, reason: 'legal_noise' };
          }

          // 1.1 Bỏ qua nút Reload / Tải lại của trang lỗi mạng Chrome (chrome-error://)
          if (/^reload$|^tải lại$/i.test(text) || el.id === 'reload-button' || (el.classList && el.classList.contains('reload-button'))) {
            return { valid: false, reason: 'browser_reload_error' };
          }

          // 2. Kiểm tra từ khóa menu / đăng nhập / tài khoản / liên hệ
          // Chú ý: Nút trong form hoặc div container, nút có type="submit" hoặc nút BUTTON CTA không bị coi là navNoise!
          const insideForm = typeof el.closest === 'function' ? el.closest('form, [role="form"], .form, .form-container, .survey-container, .quiz-container, .step-container, .card, div:has(input)') : null;
          const isSubmitRole = tag === 'BUTTON' || (el.type || '').toLowerCase() === 'submit';
          if (!insideForm && !isSubmitRole) {
            const navNoise = /^(sign\s*in|login|log\s*in|my\s*account)$|^(home|homepage)$|\bhome\s*page\b|\b(menu|main menu)\b|\b(cart|shopping cart)\b|\bportal\b|\b(contact\s*us|about\s*us|help & faq|faqs?)\b/i;
            if (navNoise.test(text) || navNoise.test(href) || navNoise.test(idAndClass)) {
              return { valid: false, reason: 'nav_noise' };
            }
          }

          if (typeof href === 'string' && (href.startsWith('mailto:') || href.startsWith('tel:'))) {
            return { valid: false, reason: 'contact_link' };
          }

          if (/cancel|back|previous|prev|quay lại|hủy|close|đóng|skip|bỏ qua/i.test(text)) {
            return { valid: false, reason: 'cancel_text' };
          }

          // 3. Bỏ qua nút nằm trong header / site-level footer / nav (nếu trang có thẻ)
          if (!insideForm) {
            const inSiteHeaderOrNav = typeof el.closest === 'function' ? el.closest('header, nav, #header, #nav, .site-header, .site-nav') : null;
            const inSiteFooter = typeof el.closest === 'function' ? el.closest('.site-footer, #footer, body > footer:not([class*="form"]):not([class*="step"]):not([class*="survey"]):not([class*="quiz"]):not([class*="modal"]):not([class*="card"])') : null;
            if (inSiteHeaderOrNav || inSiteFooter) {
              return { valid: false, reason: 'header_footer' };
            }
          }

          // 4. Kiểm tra vị trí hình học: nếu ở đỉnh trang (< 45px) trên trang dài mà không nằm trong form
          if (rect && rect.top < 45 && typeof document !== 'undefined' && (document.body?.scrollHeight || 0) > 500 && !insideForm) {
            return { valid: false, reason: 'top_header_zone' };
          }

          // 5. Nếu là thẻ A, loại bỏ nếu là inline text link trong đoạn văn bản disclaimer
          if (tag === 'A') {
            const isButtonStyled = idAndClass.includes('btn') || idAndClass.includes('button') || (typeof el.getAttribute === 'function' && el.getAttribute('role') === 'button');
            if (!isButtonStyled) {
              const parentTextEl = typeof el.closest === 'function' ? el.closest('p, small, span') : null;
              if (parentTextEl && parentTextEl.textContent && parentTextEl.textContent.length > 60) {
                return { valid: false, reason: 'inline_disclaimer_link' };
              }
            }
          }

          if (tag === 'BUTTON') return { valid: true };
          if (tag === 'INPUT' && ['submit', 'button', 'image'].includes((el.type || '').toLowerCase())) return { valid: true };
          if (tag === 'A' || (typeof el.getAttribute === 'function' && el.getAttribute('role') === 'button')) return { valid: true };
          if (el.classList && (el.classList.contains('btn') || el.classList.contains('button') || /continue|next|submit|signup|register/i.test(el.className || ''))) return { valid: true };

          if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
            const style = window.getComputedStyle(el);
            if (style && style.cursor === 'pointer' && text.length > 0 && text.length < 60) return { valid: true };
          }

          return { valid: true };
        }, SUBMIT_SCAN_VIEWPORTS).catch(() => ({ valid: true })) : { valid: true };

        if (!validation.valid) continue;

        // Nút do website vô hiệu hóa có thể đang gửi dữ liệu hoặc đang thiếu
        // trường hợp lệ; không can thiệp vào trạng thái React của trang.
        const isEnabled = await btn.isEnabled().catch(() => false);
        if (!isEnabled) continue;

        return btn;
      }
    } catch {}
  }

  // 5. Fallback thông minh: Quét trực tiếp DOM trong frame để tìm nút Submit của form
  try {
    const foundByDom = await frame.evaluate((maxViewports) => {
      const inFirstScreen = (el) => el.getBoundingClientRect().top + (window.scrollY || 0) <= (window.innerHeight || 0) * maxViewports;
      const isVisible = (el) => {
        if (!el || el.disabled) return false;
        const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
        if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 4 && rect.height > 4;
      };

      const isNoiseOrNav = (el) => {
        if (el.closest('form[role="search"], form:has(input[type="search"][name="q"])')) return true;
        const inForm = Boolean(el.closest('form') || el.form);
        const isSubmitTag = (el.tagName || '').toUpperCase() === 'BUTTON' || (el.type || '').toLowerCase() === 'submit';
        const text = (el.innerText || el.value || el.textContent || '').trim().toLowerCase();
        const href = (el.getAttribute ? el.getAttribute('href') : '') || '';
        const idAndClass = `${el.id || ''} ${el.className || ''}`.toLowerCase();
        const legalNoise = /privacy|terms|condition|policy|disclaimer|cookie|copyright|all rights reserved|do not sell|opt[- ]?out|unsubscribe|dmca|legal|disclosure/i;
        if (legalNoise.test(text) || legalNoise.test(href) || legalNoise.test(idAndClass)) return true;
        if (!inForm && !isSubmitTag) {
          const navNoise = /^(sign\s*in|login|log\s*in|my\s*account)$|^(home|homepage)$|\bhome\s*page\b|\b(menu|main menu)\b|\b(cart|shopping cart)\b|\bportal\b|\b(contact\s*us|about\s*us|help & faq|faqs?)\b/i;
          if (navNoise.test(text) || navNoise.test(href) || navNoise.test(idAndClass)) return true;
        }
        if (href.startsWith('mailto:') || href.startsWith('tel:')) return true;
        if (/cancel|back|previous|prev|quay lại|hủy|close|đóng|skip|bỏ qua/i.test(text)) return true;
        const inHeader = el.closest('header, nav, #header, #nav, .site-header, .site-nav');
        if (inHeader && !inForm) return true;
        const rect = el.getBoundingClientRect();
        if (rect.top < 45 && document.body.scrollHeight > 500 && !inForm) return true;
        return false;
      };

      // 5.1 Tìm trong các form hoặc container div chứa input đang hiển thị
      // Tránh dính nút đáp án khảo sát alpha-intent (question-answer-button): trả lời câu hỏi
      // là hành vi riêng, không được coi là nút submit nếu trở thành đáp án.
      const forms = Array.from(document.querySelectorAll('form, [role="form"], .form, .form-container, .survey-container, div:has(input)')).filter(isVisible);
      for (const form of forms) {
        const sub = form.querySelector('button[type="submit"], input[type="submit"], button:not([type="button"]):not([type="reset"]):not(.question-answer-button):not([id^="answer-"])');
        if (sub && isVisible(sub) && inFirstScreen(sub) && !isNoiseOrNav(sub)) {
          sub.setAttribute('data-ux-submit-target', 'true');
          return true;
        }
        const anyBtn = Array.from(form.querySelectorAll('button:not([type="reset"]):not(.question-answer-button):not([id^="answer-"]), [role="button"], a.btn, a.button, input[type="button"]')).find((b) => isVisible(b) && inFirstScreen(b) && !isNoiseOrNav(b));
        if (anyBtn) {
          anyBtn.setAttribute('data-ux-submit-target', 'true');
          return true;
        }
      }

      // 5.2 Tìm ngoài form: bất kỳ button nào có style hoặc text submit/continue/next
      const allButtons = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"], a.btn, a.button, a.cta-button, .cta-button')).filter((b) => isVisible(b) && inFirstScreen(b));
      for (const btn of allButtons) {
        if (isNoiseOrNav(btn)) continue;
        const text = (btn.innerText || btn.value || btn.textContent || '').trim().toLowerCase();
        if (/continue|submit|next|get quote|get started|see results|claim|proceed|tiếp tục|xác nhận|hoàn thành|agree|start|sign up|register|join|enter|survey/i.test(text)) {
          btn.setAttribute('data-ux-submit-target', 'true');
          return true;
        }
      }

      return false;
    }, SUBMIT_SCAN_VIEWPORTS).catch(() => false);

    if (foundByDom) {
      const targetLoc = frame.locator('[data-ux-submit-target="true"]').first();
      if ((await targetLoc.count().catch(() => 0)) > 0) {
        return targetLoc;
      }
    }
  } catch {}

  return null;
}

/**
 * Danh sách đầy đủ các selector phần tử gợi ý địa chỉ (Google Places, Loqate, Mapbox, Algolia, ARIA listbox, jQuery UI, Custom).
 */
export const ADDRESS_SUGGESTION_SELECTORS = [
  // 1. Google Places / PCA Predict / Loqate
  '.pac-container:not([style*="display: none"]) .pac-item',
  '.pac-container .pac-item',
  '.pca .pcaitem',
  '.pac-item',
  '.pac-item-query',
  '.pac-matched',
  '.loco-dropdown .loco-item',
  '.loco-item',
  // 2. Mapbox / Algolia / Radar / SmartyStreets
  '.mapboxgl-ctrl-geocoder--suggestion',
  '.ap-suggestion',
  '.radar-autocomplete-item',
  '.smarty-suggestion',
  // 3. ARIA Combobox / Listbox
  '[role="listbox"]:not([style*="display: none"]) [role="option"]',
  '[role="listbox"] [role="option"]',
  '[role="combobox"] ~ [role="listbox"] [role="option"]',
  '[role="combobox"] + div [role="option"]',
  'ul[role="listbox"] li',
  // 4. jQuery UI / Typeahead / Select2 / Chosen
  '.ui-autocomplete:not([style*="display: none"]) .ui-menu-item',
  '.ui-autocomplete .ui-menu-item',
  '.ui-menu-item-wrapper',
  '.select2-results__option--selectable',
  '.select2-results__option',
  '.select2-search-choice',
  '.tt-suggestion',
  '.typeahead-suggestion',
  '.chosen-results li.active-result',
  // 5. Generic Custom Address Autocomplete
  '.address-predictions li',
  '.address-predictions div[role="button"]',
  '.address-autocomplete-item',
  '.address-suggestion',
  '.address-results li',
  '.address-results div[role="button"]',
  '.address-item',
  '.prediction-item',
  '.autocomplete-suggestion',
  '[class*="autocomplete"] [class*="item"]',
  '[class*="autocomplete"] [class*="suggestion"]',
  '[class*="autocomplete"] [class*="option"]',
  '[class*="address"] [class*="suggestion"]',
  '[class*="address"] [class*="item"]',
  '[class*="address"] [class*="result"]',
  '[class*="address"] [class*="prediction"]',
  '[data-place-id]',
  '[data-prediction]',
  '[data-address-suggestion]',
  '.saved-address-item',
  '.address-list li',
  '.address-list a',
  '.saved-addresses li',
  '.saved-addresses a',
  '.saved-addresses button',
];

/**
 * Kiểm tra xem trên trang web có dropdown gợi ý địa chỉ từ API nào đang mở và hiển thị hay không.
 *
 * @param {object} page Page Playwright.
 * @param {object} [frame=null] Frame Playwright (nếu có).
 * @return {Promise<boolean>} True nếu có menu gợi ý địa chỉ đang mở.
 */
export async function hasActiveAddressSuggestions(page, frame = null) {
  const target = frame || page;
  if (!target || typeof target.evaluate !== 'function') return false;
  try {
    const res = await target.evaluate(() => {
      if (typeof document === 'undefined') return false;
      const isVisible = (el) => {
        if (!el || el.disabled) return false;
        const s = window.getComputedStyle ? window.getComputedStyle(el) : null;
        if (s && (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0')) return false;
        const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
        return r ? (r.width > 0 && r.height > 0) : true;
      };
      const containers = [
        '.pac-container',
        '.pca',
        '.ui-autocomplete',
        '[role="listbox"]',
        '.select2-dropdown',
        '.mapboxgl-ctrl-geocoder',
        '.address-predictions',
        '.address-results',
        '[class*="autocomplete-container"]',
        '[class*="address-dropdown"]',
        '.loco-dropdown',
      ];
      for (const c of containers) {
        try {
          const el = document.querySelector(c);
          if (el && isVisible(el)) return true;
        } catch {}
      }
      return false;
    }).catch(() => false);
    return res === true;
  } catch {
    return false;
  }
}

/**
 * Tự động tìm và chọn phần tử gợi ý địa chỉ đầu tiên từ danh sách API của trang web.
 * Hỗ trợ Google Places, Loqate, Mapbox, Algolia, ARIA listbox và custom dropdowns.
 *
 * @param {object} page Page Playwright.
 * @param {object} [frame=null] Frame Playwright.
 * @param {object} [field=null] Locator ô input địa chỉ (dùng cho fallback keyboard).
 * @param {object} [options={}] Tùy chọn log.
 * @return {Promise<boolean>} True nếu đã chọn thành công mục gợi ý.
 */
export async function selectFirstAddressSuggestion(page, frame = null, field = null, options = {}) {
  const contexts = [frame, page].filter((c) => c && typeof c.locator === 'function');
  for (const ctx of contexts) {
    for (const sel of ADDRESS_SUGGESTION_SELECTORS) {
      try {
        const item = ctx.locator(sel).first();
        if ((await item.count().catch(() => 0)) > 0) {
          const visible = await item.isVisible({ timeout: 120 }).catch(() => false);
          if (visible) {
            // Chuỗi sự kiện đầy đủ cho Google Places / Loqate / custom JS listeners
            await item.evaluate((el) => {
              el.scrollIntoView?.({ block: 'nearest' });
              el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
              el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
              el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
              el.click();
            }).catch(() => {});

            // Thao tác click Playwright
            await item.click({ force: true, timeout: 500 }).catch(() => {});

            options.onLog?.({
              type: 'address_suggestion_selected',
              detail: `[Address Autocomplete] Đã tự động chọn gợi ý địa chỉ đầu tiên từ API: [${sel.slice(0, 40)}]`,
            }, page);
            return true;
          }
        }
      } catch {}
    }
  }

  // Fallback nếu không click được phần tử DOM: dùng phím ArrowDown + Enter
  if (field && typeof field.press === 'function') {
    try {
      await field.press('ArrowDown').catch(() => {});
      if (page && typeof page.waitForTimeout === 'function') {
        await page.waitForTimeout(100).catch(() => {});
      } else {
        await new Promise((r) => setTimeout(r, 100));
      }
      await field.press('Enter').catch(() => {});
      return true;
    } catch {}
  }

  return false;
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
 * Xử lý khảo sát co-reg "adsmith forge" (#AS_SURVEY iframe):
 * - Ở trang cha: click chuột thật vào tâm iframe để focus (bước "bấm vào frame").
 * - Bên trong iframe: mỗi lượt trả lời 1 nhóm câu hỏi (radio/checkbox, random),
 *   sau đó click thật nút Continue/Next/Submit bên trong.
 *
 * @param {object} page Trang Playwright hiện tại.
 * @param {object} frame Frame đang quét.
 * @param {object} [options={}] Tùy chọn (onLog).
 * @return {Promise<number>} Số thao tác đã thực hiện.
 * @author coder-nguoi-tay
 * @since 2026-10-25
 */
export async function handleAdsmithSurvey(page, frame, options = {}) {
  if (!frame || typeof frame.url !== 'function') return 0;
  const frameUrl = frame.url() || '';
  const parentUrl = typeof page.url === 'function' ? page.url() : '';
  const now = Date.now();

  // Step 1: trang cha có #AS_IFRAME → click chuột thật vào tâm iframe (focus vào frame)
  if (frameUrl === parentUrl || page.frames().length > 0) {
    if (!page._uxAsFrameClickedAt || (now - page._uxAsFrameClickedAt) > 5000) {
      try {
        const iframeLoc = frame.locator('#AS_IFRAME, #AS_SURVEY iframe').first();
        const visible = await iframeLoc.isVisible().catch(() => false);
        if (visible) {
          await page.bringToFront().catch(() => {});
          const box = await iframeLoc.boundingBox().catch(() => null);
          if (box && box.width > 10 && box.height > 10) {
            await page.mouse.click(box.x + box.width / 2, box.y + Math.min(40, box.height / 2), { delay: 30 }).catch(() => {});
            page._uxAsFrameClickedAt = now;
            options.onLog?.({ type: 'as_frame_focus', detail: `[AS Survey] Đã click chuột thật vào #AS_IFRAME để focus frame khảo sát.` });
            return 1;
          }
        }
      } catch {}
    }
  }

  // Step 2: đang ở bên trong frame adsmith → trả lời 1 nhóm câu hỏi mỗi lượt
  if (!frameUrl.includes('adsmith.io')) return 0;
  if (!frame._uxAsHandledAt || (now - frame._uxAsHandledAt) < 2000) return 0;
  frame._uxAsHandledAt = now;

  let done = 0;
  try {
    // Trả lời 1 nhóm radio/checkbox visible chưa chọn
    const groups = await frame.evaluate(() => {
      const isVisible = (el) => {
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const sel = 'input[type="radio"], input[type="checkbox"]';
      const groups = new Map();
      for (const inp of document.querySelectorAll(sel)) {
        if (!isVisible(inp)) continue;
        const name = inp.name || inp.id || 'asq';
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name).push(inp);
      }
      for (const [name, inputs] of groups) {
        if (inputs.some((i) => i.checked)) continue;
        return name; // nhóm đầu tiên chưa trả lời (theo thứ tự DOM, thường theo bước khảo sát)
      }
      return null;
    }).catch(() => null);

    if (groups) {
      const radioLoc = frame.locator(`input[name="${groups}"]:not(:checked)`).first();
      if (await radioLoc.count().catch(() => 0) > 0) {
        await page.bringToFront().catch(() => {});
        await radioLoc.click({ force: true, timeout: 3000 }).catch(() => {});
        done += 1;
        options.onLog?.({ type: 'as_answered', field: groups, detail: `[AS Survey] Đã chọn ngẫu nhiên đáp án cho nhóm "${groups}".` });
      }
    } else {
      // Hết câu hỏi → bấm Continue/Next/Submit bên trong frame
      const contSel = 'button, a, input[type="button"], input[type="submit"], [role="button"]';
      const btn = await frame.evaluate(() => {
        const isVisible = (el) => {
          const s = getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        };
        const candidates = Array.from(document.querySelectorAll('button, a, input[type="button"], input[type="submit"], [role="button"]'))
          .filter((b) => {
            if (!isVisible(b) || b.disabled) return false;
            const t = String(b.innerText || b.value || '').trim().toLowerCase();
            return /^(continue|next|submit|done|finish|get my results|tiếp tục)/.test(t) && !/privacy|terms/.test(t);
          });
        if (!candidates.length) return null;
        const b = candidates[0];
        if (b.id) return `#${CSS.escape(b.id)}`;
        const uid = `ux-as-next-${Math.random().toString(36).slice(2, 10)}`;
        b.setAttribute('data-ux-as-next', uid);
        return `[data-ux-as-next="${uid}"]`;
      }).catch(() => null);
      if (btn) {
        await page.bringToFront().catch(() => {});
        await frame.locator(btn).first().click({ force: true, timeout: 3000 }).catch(() => {});
        done += 1;
        options.onLog?.({ type: 'submit_clicked', detail: `[AS Survey] Đã bấm nút Continue bên trong khảo sát adsmith.` });
      }
    }
  } catch {}
  return done;
}

/**
 * Xử lý thẻ SOI yes/no của funnel "alpha-intent" (SweepstakesAlerts / PrizeGrab):
 * - Tick consent TCPA (data-tf-element-role="consent-opt-in") nếu chưa tick.
 * - Chọn Yes (70%) / No (30%) theo cùng tỉ lệ với thẻ co-reg twy, click bằng chuột thật.
 * - Mỗi thẻ chỉ xử lý 1 lần (đánh dấu data-ux-soi-done).
 *
 * @param {object} page Trang Playwright hiện tại.
 * @param {object} frame Frame đang quét.
 * @param {object} [options={}] Tùy chọn (onLog).
 * @return {Promise<number>} Số thẻ đã trả lời.
 * @author coder-nguoi-tay
 * @since 2026-10-25
 */
export async function handleAlphaIntentSoiCards(page, frame, options = {}) {
  if (!frame || typeof frame.locator !== 'function') return 0;
  const now = Date.now();
  if (frame._uxSoiHandledAt && (now - frame._uxSoiHandledAt) < 2000) return 0;
  frame._uxSoiHandledAt = now;

  let done = 0;
  // Bước 1: tick consent TCPA hiển thị (cần thiết cho nhánh Yes của SOI)
  try {
    const consentLoc = frame.locator('[data-object-creative-type="soiyesno"] label:has(input[data-tf-element-role="consent-opt-in"])').first();
    if (await consentLoc.count().catch(() => 0) > 0) {
      const unchecked = await consentLoc.evaluate((label) => {
        const box = label.querySelector('input[data-tf-element-role="consent-opt-in"]');
        return box && !box.checked;
      }).catch(() => false);
      if (unchecked) {
        await page.bringToFront().catch(() => {});
        await consentLoc.click({ force: true, timeout: 3000 }).catch(() => {});
        done += 1;
        options.onLog?.({ type: 'soi_consent', detail: '[Alpha SOI] Đã tick consent TCPA của thẻ offer.' });
      }
    }
  } catch {}

  // Bước 2: chọn Yes/No (1 thẻ, 1 lần). Thẻ chưa xử lý được đánh dấu data-ux-soi-done.
  let choice = null;
  try {
    const pick = await frame.evaluate(() => {
      const card = document.querySelector('[data-object-creative-type="soiyesno"]');
      if (!card) return null;
      if (card.getAttribute('data-ux-soi-done') === '1') return null;
      if (Math.random() < 0.3) {
        const no = card.querySelector('#ct-creative-submit-no');
        if (no) { card.setAttribute('data-ux-soi-done', '1'); return 'no'; }
      }
      const yes = card.querySelector('#ct-creative-submit-yes');
      if (yes) { card.setAttribute('data-ux-soi-done', '1'); return 'yes'; }
      return null;
    }).catch(() => null);
    choice = pick;
  } catch {}

  if (choice) {
    try {
      const btnLoc = frame.locator(choice === 'yes' ? '#ct-creative-submit-yes' : '#ct-creative-submit-no').first();
      if (await btnLoc.count().catch(() => 0) > 0) {
        await page.bringToFront().catch(() => {});
        const clicked = await btnLoc.click({ force: true, timeout: 3000 }).then(() => true).catch(() => false);
        if (!clicked) {
          // Fallback JS click (alpha-intent onclick vẫn chạy được)
          await frame.evaluate((c) => {
            const el = document.querySelector(c === 'yes' ? '#ct-creative-submit-yes' : '#ct-creative-submit-no');
            if (el) el.click();
          }, choice).catch(() => {});
        }
        done += 1;
        options.onLog?.({
          type: 'soi_answered',
          detail: `[Alpha SOI] Đã trả lời thẻ SOI: chọn "${choice === 'yes' ? 'Yes' : 'No'}" (random 70% Yes / 30% No).`,
        });
      }
    } catch {}
  }
  return done;
}

/**
 * Tự trả lời các màn câu hỏi khảo sát của funnel "alpha-intent" (SweepstakesAlerts...):
 * các nút đáp án `button.question-answer-button` / `button[id^="answer-"]` với onclick
 * `alphaIntent.submitAnswers()`. Chọn 1 đáp án ngẫu nhiên (tránh "None of the Above"/skip)
 * mỗi lượt quét; sau khi chọn xong, click nút Continue (`#submit-button`) nếu xuất hiện.
 *
 * @param {object} page Trang Playwright hiện tại.
 * @param {object} frame Frame đang quét.
 * @param {object} [options={}] Tùy chọn (onLog).
 * @return {Promise<number>} Số thao tác đã thực hiện.
 * @author coder-nguoi-tay
 * @since 2026-10-25
 */
/**
 * Mẫu nhận diện loại câu hỏi §17.3, dạng chuỗi để truyền được vào `frame.evaluate`.
 * Có `\\b` để `page`/`manage`/`care`/`business` không bị nhận nhầm. Thứ tự có ý nghĩa (age → preference → vehicle).
 *
 * @type {Array<[string, string]>}
 */
export const QUESTION_TYPE_PATTERNS = [
  ['age_range', '\\b(?:age|how old|years? old|age range|under 18|18-24|25-34|35-44|45-54|55-64|65\\+)'],
  ['preference', '\\b(?:favou?rite|prefer(?:red|ence)?|like most|what do you like)\\b'],
  ['vehicle', '\\b(?:vehicles?|cars?|trucks?|suvs?|motorcycles?|vans?|bus|drives?|driving|transport(?:ation)?)\\b'],
];

/**
 * Phân loại câu hỏi theo tài liệu nghiên cứu §17 (PLAYWRIGHT_CORE_INTEGRATION_RESEARCH.md):
 * 'age_range' | 'preference' | 'vehicle' | 'unknown'.
 *
 * @param {string} text Văn bản câu hỏi (đã normalize朱 lowercase).
 * @return {'age_range'|'preference'|'vehicle'|'unknown'} Loại câu hỏi.
 * @author coder-nguoi-tay
 * @since 2026-10-27
 */
export function classifyQuestionText(text) {
  const t = String(text || '').toLowerCase();
  for (const [type, src] of QUESTION_TYPE_PATTERNS) {
    if (new RegExp(src).test(t)) return type;
  }
  return 'unknown';
}

/**
 * Chọn đáp án theo nghĩa cho câu §17 từ danh sách nhãn option (đã lọc qua optionScorer).
 *
 * @param {string} qType Loại câu hỏi ('age_range' | 'preference' | 'vehicle').
 * @param {string[]} labels Nhãn option (lowercase), theo thứ tự DOM.
 * @param {object} [rec={}] Bản ghi lead.
 * @param {number|null} [age=null] Tuổi đã tính từ record.
 * @return {{index: number, confidence: 'record'|'block_score'|'first_answer'}|null} Vị trí option được chọn.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-27
 */
export function chooseSemanticAnswer(qType, labels = [], rec = {}, age = null) {
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const find = (fn) => labels.findIndex(fn);
  const byWant = (want) => (want ? find((l) => l.includes(want) || want.split(' ').some((w) => w.length > 2 && l.includes(w))) : -1);
  const byPriority = (list, extra = () => true) => {
    for (const kw of list) {
      const i = find((l) => (kw instanceof RegExp ? kw.test(l) : l.includes(kw)) && extra(l));
      if (i >= 0) return i;
    }
    return -1;
  };
  let i = -1;
  if (qType === 'age_range') {
    if (age > 10 && age < 100) {
      i = find((l) => {
        const m = l.match(/(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})/);
        if (m) return age >= Number(m[1]) && age <= Number(m[2]);
        const plus = l.match(/(\d{2})\s*(?:\+|and over|or older|and older|plus)/) || l.match(/over\s*(\d{2})/);
        if (plus) return age >= Number(plus[1]);
        if (/under 18|18 & under/.test(l)) return age < 18;
        return false;
      });
      if (i >= 0) return { index: i, confidence: 'record' };
    }
    // Mức phổ biến trong survey: trung bình trước, già cao nhất cuối
    i = byPriority([/25[-– ]34/, /35[-– ]44/, /45[-– ]54/, /18[-– ]24/, /55[-– ]64/, /65\+|over 65/]);
  } else if (qType === 'preference') {
    i = byWant(norm(rec.favorite_vehicle || rec.vehicle_preference || rec.favorite || rec.vehicle_type));
    if (i >= 0) return { index: i, confidence: 'record' };
    i = byPriority(['suv', 'sedan', 'truck', 'car', 'motorcycle', 'van', 'bus']);
  } else if (qType === 'vehicle') {
    i = byWant(norm(rec.vehicle_type || rec.vehicle_make || rec.car_make || rec.vehicle_model));
    if (i >= 0) return { index: i, confidence: 'record' };
    // §17.5 ví dụ 3: hiện tại drives không rõ → ưu tiên Car; tránh "I do not drive"
    i = byPriority(['car', 'suv', 'sedan', 'truck', 'motorcycle', 'van', 'bus'], (l) => !/drive|do not|don.t/.test(l));
  }
  if (i >= 0) return { index: i, confidence: 'block_score' };
  // User chỉ rõ: chọn đáp án ĐẦU TIÊN làm fallback thay vì bỏ qua (tránh điểm chết dừng survey).
  // Vẫn né "None of the Above"/"Skip"/"I do not drive" nếu có lựa chọn khác đi trước.
  i = find((l) => !/none of the above|none of above|skip|prefer not|do not drive|don.t drive|not currently/.test(l));
  if (i < 0 && labels.length) i = 0;
  return i >= 0 ? { index: i, confidence: 'first_answer' } : null;
}

/**
 * Trả lời câu hỏi survey dạng semantic theo §17: age / preference / vehicle.
 *
 * Luật (không được làm của tài liệu):
 * - KHÔNG dùng first().click() cho age/vehicle/preference.
 * - KHÔNG so sánh option từ toàn page — chỉ trong cùng block câu hỏi.
 * - Có record: match theo record.age / vehicle_type / vehicle_make / favorite_vehicle.
 * - Không record: chọn option có score cao nhất block-local (không random nút đầu).
 * - Mơ hồ => ambiguous, không click.
 * Click thật (bringToFront + locator, fallback mouse), throttle 2s/frame.
 *
 * @param {object} page Trang Playwright hiện tại.
 * @param {object} frame Frame đang quét.
 * @param {object} [options={}] Tùy chọn (onLog, record — bản ghi hiện tại của tab/session).
 * @return {Promise<number>} Số thao tác đã thực hiện.
 * @author coder-nguoi-tay
 * @since 2026-10-27
 */
export async function handleSurveySemanticQuestions(page, frame, options = {}) {
  if (!frame || typeof frame.locator !== 'function') return 0;
  const now = Date.now();
  if (frame._uxSemanticQAt && (now - frame._uxSemanticQAt) < 2000) return 0;
  frame._uxSemanticQAt = now;

  const record = options.record || {};
  const userAge = Number(record.age) > 10 ? Number(record.age) : calculateAge(record);
  const found = await frame.evaluate(({ patterns }) => {
    const classifyQuestionText = (text) => {
      const t = String(text || '').toLowerCase();
      const hit = patterns.find(([, src]) => new RegExp(src).test(t));
      return hit ? hit[0] : 'unknown';
    };
    const OPTION_SELECTORS = [
      'button',
      'label input[type="radio"]',
      'label input[type="checkbox"]',
      '[data-ux-choice-id]',
      'a[id^="answer-"]',
      'button[id^="answer-"]',
    ];
    const isVisible = (el) => {
      if (!el) return false;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
      const r = el.getBoundingClientRect();
      return r.width > 4 && r.height > 4;
    };
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const txt = (el) => norm(el.innerText || el.textContent || '');

    // Gom option nhìn thấy, nhóm theo block (closest common ancestor)
    const options = [];
    document.querySelectorAll(OPTION_SELECTORS.join(', ')).forEach((el) => {
      const interactive = el.matches('input') ? (el.closest('label') || el.parentElement) : el;
      if (!interactive || interactive.getAttribute('data-ux-semantic-clicked') === '1') return;
      if (!isVisible(interactive)) return;
      const label = txt(interactive).slice(0, 90);
      if (!label || label.length < 2) return;
      options.push({ el: interactive, label });
    });
    if (options.length < 2) return null;

    // Block: tổ tiên chung cấp nhỏ nhất chứa ≥2 option
    const blockOf = (el) => el.closest('[role="group"], form, section, .question, .block, ul, .card') || el.parentElement;
    const byBlock = new Map();
    options.forEach((o) => {
      if (!o.el.isConnected) return;
      // bỏ nút điều hướng trong option (Continue/Submit) nếu label quá ngắn và trùng nút submit
      if (/^(continue|next|submit|ok|done)$/i.test(o.label)) return;
      const b = blockOf(o.el) || document.body;
      if (!byBlock.has(b)) byBlock.set(b, []);
      byBlock.get(b).push(o);
    });
    // Phần chữ câu hỏi: bỏ qua mọi phần tử là/chứa option để chữ của đáp án không lẫn vào việc phân loại.
    // depth = 0 nghĩa là câu hỏi nằm ngay trong block (điểm "gần câu hỏi" của optionScorer).
    const isOption = (n) => options.some((o) => o.el === n || o.el.contains(n) || n.contains(o.el));
    const headOf = (block) => {
      for (let node = block, depth = 0; node && node !== document.body && depth < 3; node = node.parentElement, depth++) {
        const text = Array.from(node.querySelectorAll('h1,h2,h3,h4,h5,legend,[role="heading"],.question-text,#questionText,dt,strong,p'))
          .filter((h) => !isOption(h))
          .map((h) => txt(h).slice(0, 160))
          .filter(Boolean)
          .join(' ')
          .slice(0, 240);
        if (text) return { text, depth };
      }
      return { text: norm(document.getElementById('questionText')?.innerText || ''), depth: 3 };
    };
    // Chỉ xét block có câu hỏi nhận diện được; trong số đó lấy block nhiều option nhất.
    let bestList = null;
    let bestHead = null;
    let qType = 'unknown';
    byBlock.forEach((list, block) => {
      if (list.length < 2) return;
      const head = headOf(block);
      const t = classifyQuestionText(head.text);
      if (t === 'unknown') return;
      if (!bestList || list.length > bestList.length) {
        bestList = list;
        bestHead = head;
        qType = t;
      }
    });
    if (!bestList) return null;
    // Gắn uid để optionScorer trích đặc điểm và để click đúng phần tử đã chọn.
    document.querySelectorAll('[data-ux-option-uid]').forEach((n) => n.removeAttribute('data-ux-option-uid'));
    bestList.forEach((o, i) => o.el.setAttribute('data-ux-option-uid', `ux-opt-${i}`));
    return { qType, head: bestHead.text, nearQuestion: bestHead.depth === 0 };
  }, { patterns: QUESTION_TYPE_PATTERNS }).catch((e) => { console.log(`[SemanticQ] evaluate lỗi: ${e.message}`); return null; });

  // Loại bỏ branches dead-code: giữ cho linter không warning (hàm node-side dùng cho tái sử dụng)
  void classifyQuestionText;

  if (!found) return 0;
  const clearUids = () => frame.evaluate(() => document.querySelectorAll('[data-ux-option-uid]').forEach((n) => n.removeAttribute('data-ux-option-uid'))).catch(() => {});
  const optLoc = frame.locator('[data-ux-option-uid]');
  const candidates = (optLoc && typeof optLoc.evaluateAll === 'function')
    ? await optLoc.evaluateAll(extractOptionFeaturesInPage, found.nearQuestion).catch(() => [])
    : [];
  const ranked = rankOptions(candidates);
  // Option điểm < FALLBACK (ẩn, disabled, noise, đã chọn...) không được chọn, kể cả khi đúng nghĩa.
  const usable = ranked.filter((c) => c.tier !== 'skip');
  const choice = chooseSemanticAnswer(found.qType, usable.map((c) => c.label), record, userAge);
  const selected = choice ? usable[choice.index] : null;
  const head = String(found.head || '').slice(0, 60);
  if (!selected) {
    await clearUids();
    options.onLog?.({
      type: 'semantic_q_ambiguous',
      detail: `[Semantic Q] Câu "${head}" (${found.qType}) — không có option đủ điểm, không bấm.`,
      decision: buildOptionDecision({ questionText: found.head || '', ranked, reason: 'no usable candidate' }),
    });
    return 0;
  }

  const sel = `[data-ux-option-uid="${selected.uid}"]`;
  const isSelectedInPage = (s) => {
    const el = document.querySelector(s);
    if (!el || !el.isConnected || el.getBoundingClientRect().width === 0) return true; // màn đã chuyển
    const input = el.matches('input') ? el : el.querySelector('input');
    if (input) return input.checked;
    return /selected|active|checked|chosen/i.test(el.className) || ['aria-pressed', 'aria-checked', 'aria-selected'].some((a) => el.getAttribute(a) === 'true');
  };
  try {
    const loc = frame.locator(sel).first();
    if (await loc.count().catch(() => 0) === 0) { await clearUids(); return 0; }
    await frame.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return;
      el.classList.remove('ai-pointer-events-none');
      el.style.pointerEvents = 'auto';
      let a = el.parentElement;
      while (a && a !== document.body) { a.style.visibility = 'visible'; a = a.parentElement; }
    }, sel).catch(() => {});
    await page.bringToFront().catch(() => {});
    let fallbackUsed = selected.tier === 'fallback';
    let clicked = await loc.click({ force: true, timeout: 3000 }).then(() => true).catch(() => false);
    if (!clicked) {
      const box = await loc.boundingBox().catch(() => null);
      if (box && box.width > 2 && box.height > 2) {
        await page.bringToFront().catch(() => {});
        await page.mouse.click(box.x + Math.min(box.width / 2, box.width - 3), box.y + Math.min(box.height / 2, box.height - 3), { delay: 20 });
        clicked = true;
        fallbackUsed = true;
      }
    }
    if (!clicked) { await clearUids(); return 0; }
    // Verify §16.4.6; chưa thấy trạng thái đã chọn thì thử nấc cuối §15.5 (el.click() trong trang) rồi verify lại.
    let verified = await frame.evaluate(isSelectedInPage, sel).catch(() => true);
    if (!verified) {
      await frame.evaluate((s) => document.querySelector(s)?.click(), sel).catch(() => {});
      fallbackUsed = true;
      verified = await frame.evaluate(isSelectedInPage, sel).catch(() => true);
    }
    await frame.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return;
      el.setAttribute('data-ux-semantic-clicked', '1');
      el.setAttribute('data-ux-qclicked', '1'); // để AlphaQ biết màn đã được trả lời và bấm Continue
    }, sel).catch(() => {});
    await clearUids();
    const decision = buildOptionDecision({ questionText: found.head, ranked, selected, verified, fallbackUsed, reason: `${found.qType} / ${choice.confidence} / tier ${selected.tier}` });
    if (!verified) options.onLog?.({ type: 'semantic_q_unverified', detail: `[Semantic Q] Đã bấm "${selected.label}" nhưng chưa thấy trạng thái đã chọn.`, decision });
    options.onLog?.({
      type: 'semantic_q_answered',
      detail: `Đã chọn (${choice.confidence === 'record' ? 'theo record' : choice.confidence === 'first_answer' ? 'fallback-đáp-án-đầu-tiên' : 'theo block-score'}, điểm ${selected.score}) "${selected.label}" cho câu ${found.qType}: "${head}".`,
      decision,
    });
    return 1;
  } catch {}
  await clearUids();
  return 0;
}

export async function handleAlphaIntentQuestions(page, frame, options = {}) {
  if (!frame || typeof frame.locator !== 'function') return 0;
  const now = Date.now();
  if (frame._uxQHandledAt && (now - frame._uxQHandledAt) < 2000) return 0;
  frame._uxQHandledAt = now;

  let action = null;
  try {
    action = await frame.evaluate((qPatterns) => {
      const isVisible = (el) => {
        const s = getComputedStyle(el);
        // KHÔNG tính opacity=0 là ẩn: funnel alpha-intent fade-in nút đáp án (opacity 0
        // trong lúc animation) nhưng vẫn nhận click thật như người dùng bấm tay (isTrusted).
        if (s.display === 'none' || s.visibility === 'hidden') return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      // Chỉ đứng trong như thẻ SOI yes/no (handler khác lo) hoặc offerwall card
      const inSoiOrOfferwall = (el) => !!el.closest('[data-object-creative-type="soiyesno"], .offerwall-card, form[data-tf-element-role="offer"]');

      const answers = Array.from(document.querySelectorAll('button.question-answer-button, button[id^="answer-"]'))
        .filter((b) => isVisible(b) && !b.disabled && b.getAttribute('data-ux-qclicked') !== '1' && !inSoiOrOfferwall(b));
      // Câu age/preference/vehicle do handleSurveySemanticQuestions (§17) trả lời; AlphaQ chỉ bấm Continue.
      const qText = (document.getElementById('questionText')?.innerText || document.querySelector('h1,h2,h3')?.innerText || '').toLowerCase();
      const semanticOwned = qPatterns.some(([, src]) => new RegExp(src).test(qText));
      // Quota đáp án theo loại câu: single = 1, multi-select = 2 (nhanh, không cần đúng) rồi bấm tiếp tục.
      const isMultiSelect = !!document.querySelector('button.ai-submit-button--multiselect, button[class*="multiselect"], [class*="multi-select"], [data-mock-action="multiselect-submit"]');
      const answerTarget = isMultiSelect ? 2 : 1;
      const clickedCount = Array.from(document.querySelectorAll('[data-ux-qclicked="1"]')).filter(isVisible).length;
      const quotaReached = clickedCount >= answerTarget;
      if (answers.length && !semanticOwned && !quotaReached) {
        // User chỉ rõ: tự động chọn câu trả lời ĐẦU TIÊN; nếu nút đầu là "None of the Above"/"Skip" thì chọn nút đầu còn lại
        const pickable = answers.filter((b) => !/none of the above|none of above|skip|prefer not/i.test(b.innerText || ''));
        const pool = pickable.length ? pickable : answers;
        const pick = pool[0];
        const uid = `ux-qclick-${Math.random().toString(36).slice(2, 10)}`;
        pick.setAttribute('data-ux-qclick-mark', uid);
        return { kind: 'answer', uid };
      }
      // Hết đáp án mới của màn: nếu có nút Continue hiển thị và ta đã click đáp án của màn này
      const screenTouched = Array.from(document.querySelectorAll('[data-ux-qclicked="1"]')).some(isVisible);
      if (screenTouched) {
        const cont = Array.from(document.querySelectorAll('button#submit-button, button[id="submit-button"], [data-testid="submit-button"]'))
          .find((b) => isVisible(b) && !b.disabled);
        if (cont) {
          const uid = `ux-qnext-${Math.random().toString(36).slice(2, 10)}`;
          cont.setAttribute('data-ux-qnext-mark', uid);
          return { kind: 'continue', uid };
        }
      }
      return null;
    }, QUESTION_TYPE_PATTERNS).catch(() => null);
  } catch {}

  if (!action) return 0;
  try {
    const markSel = action.kind === 'answer' ? `[data-ux-qclick-mark="${action.uid}"]` : `[data-ux-qnext-mark="${action.uid}"]`;
    const loc = frame.locator(markSel).first();
    if (await loc.count().catch(() => 0) > 0) {
      // Funnel alpha-intent hay gắn class "ai-pointer-events-none"/style pointer-events:none
      // trong lúc chuyển màn: gỡ cờ trước rồi click thật, kỳ click nhận isTrusted như tay.
      await frame.evaluate((a) => {
        const sel = a.kind === 'answer' ? '[data-ux-qclick-mark]' : '[data-ux-qnext-mark]';
        const el = document.querySelector(sel);
        if (!el) return;
        el.classList.remove('ai-pointer-events-none');
        el.style.pointerEvents = 'auto';
      }, action).catch(() => {});
      await page.bringToFront().catch(() => {});
      const ok = await loc.click({ force: true, timeout: 3000 }).then(() => true).catch(() => false);
      if (!ok) {
        // Fallback: click chuột thật theo tọa độ (sự kiện isTrusted như người bấm)
        const box = await loc.boundingBox().catch(() => null);
        if (box && box.width > 2 && box.height > 2) {
          await page.bringToFront().catch(() => {});
          await page.mouse.click(box.x + Math.min(box.width / 2, box.width - 3), box.y + Math.min(box.height / 2, box.height - 3), { delay: 20 }).catch(() => {});
        }
      }
    }
    // Đánh dấu đã click trong DOM (dù click thiệt hay fallback)
    await frame.evaluate((a) => {
      const sel = a.kind === 'answer' ? '[data-ux-qclick-mark]' : '[data-ux-qnext-mark]';
      const el = document.querySelector(sel);
      if (!el) return;
      if (a.kind === 'answer') {
        el.setAttribute('data-ux-qclicked', '1');
        el.removeAttribute('data-ux-qclick-mark');
      } else {
        el.removeAttribute('data-ux-qnext-mark');
        // Đã click Continue → reset cờ đáp án các nút của màn (màn chặng sau cần mới)
        document.querySelectorAll('[data-ux-qclicked]').forEach((b) => b.removeAttribute('data-ux-qclicked'));
      }
    }, action).catch(() => {});
    options.onLog?.({
      type: action.kind === 'answer' ? 'q_answered' : 'submit_clicked',
      detail: action.kind === 'answer'
        ? '[AlphaQ] Đã chọn đáp án đầu tiên của màn khảo sát (tránh "None of the Above").'
        : '[AlphaQ] Đã bấm Continue sau khi đã chọn đáp án của màn.',
    });
    return 1;
  } catch {}
  return 0;
}

/**
 * Xử lý màn "ow-addept" (offer-wall "Take the Deal" — iframe sdk.scrptk.com):
 * - Danh sách task `.unit-card` (10 task, data-creative-view-model JSON kèm headline/url).
 * - Bấm 1 task → `.info-panel` hiện CTA (#infoPanelButton) → click CTA → #skipButton để đi tiếp.
 * - Mỗi lượt quét chỉ 1 thao tác (throttle 2s), click thật qua bringToFront + locator/mouse.
 *
 * @param {object} page Trang Playwright hiện tại.
 * @param {object} frame Frame đang quét (có thể là iframe scrptk).
 * @param {object} [options={}] Tùy chọn (onLog).
 * @return {Promise<number>} Số thao tác đã thực hiện.
 * @author coder-nguoi-tay
 * @since 2026-10-26
 */
export async function handleOfferwallTasks(page, frame, options = {}) {
  if (!frame || typeof frame.locator !== 'function') return 0;
  const now = Date.now();
  if (frame._uxOwHandledAt && (now - frame._uxOwHandledAt) < 2000) return 0;
  frame._uxOwHandledAt = now;

  const state = await frame.evaluate(() => {
    if (!document.querySelector('.unit-stack') && !document.querySelector('#infoPanel')) return null;
    const isVisible = (el) => {
      if (!el) return false;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const panel = document.querySelector('#infoPanel');
    const panelVisible = panel && isVisible(panel);
    const cta = document.querySelector('#infoPanelButton');
    if (panelVisible) {
      if (cta && isVisible(cta) && (cta.innerText || '').trim() && cta.getAttribute('data-ux-ow-cta') !== '1') {
        cta.setAttribute('data-ux-ow-cta', '1');
        return { kind: 'cta', uid: 'infoPanelButton' };
      }
      const skip = document.querySelector('#skipButton') || document.querySelector('#closeButton');
      if (skip && isVisible(skip)) return { kind: 'skip', uid: skip.id };
      return null;
    }
    const cards = Array.from(document.querySelectorAll('.unit-card')).filter((c) => isVisible(c) && !c.classList.contains('hidden') && c.getAttribute('data-ux-ow-clicked') !== '1');
    if (cards.length) {
      const pick = cards[Math.floor(Math.random() * cards.length)];
      try {
        const vm = JSON.parse(pick.getAttribute('data-creative-view-model') || '{}');
        return { kind: 'card', idx: pick.getAttribute('data-index') || String(cards.indexOf(pick)), headline: String(vm.headline || '').slice(0, 80) };
      } catch {
        return { kind: 'card', idx: pick.getAttribute('data-index') || String(cards.indexOf(pick)), headline: '' };
      }
    }
    return null;
  }).catch(() => null);

  if (!state) return 0;
  try {
    let sel = null;
    if (state.kind === 'card') sel = `.unit-card[data-index="${state.idx}"]`;
    else if (state.kind === 'cta') sel = '#infoPanelButton';
    else if (state.kind === 'skip') sel = `#${state.uid}`;
    const loc = frame.locator(sel).first();
    if (await loc.count().catch(() => 0) > 0) {
      // Gỡ khóa pointer-events (như alpha-intent, funnel hay để pointer-events:none khi chuyển màn)
      await frame.evaluate((s) => {
        const el = document.querySelector(s);
        if (!el) return;
        el.classList.remove('ai-pointer-events-none');
        el.style.pointerEvents = 'auto';
        el.style.visibility = 'visible';
        let a = el.parentElement;
        while (a && a !== document.body) { a.style.visibility = 'visible'; a = a.parentElement; }
      }, sel).catch(() => {});
      await page.bringToFront().catch(() => {});
      let clicked = await loc.click({ force: true, timeout: 3000 }).then(() => true).catch(() => false);
      if (!clicked) {
        const box = await loc.boundingBox().catch(() => null);
        if (box && box.width > 2 && box.height > 2) {
          await page.bringToFront().catch(() => {});
          await page.mouse.click(box.x + Math.min(box.width / 2, box.width - 3), box.y + Math.min(box.height / 2, box.height - 3), { delay: 20 }).catch(() => {});
          clicked = true;
        }
      }
      if (!clicked) return 0;
      if (state.kind === 'card') {
        await frame.evaluate((i) => {
          const el = document.querySelector(`.unit-card[data-index="${i}"]`);
          if (el) el.setAttribute('data-ux-ow-clicked', '1');
        }, state.idx).catch(() => {});
        options.onLog?.({ type: 'ow_task_selected', detail: `[OW Task] Đã chọn task ngẫu nhiên: "${state.headline || state.idx}".` });
      } else if (state.kind === 'cta') {
        options.onLog?.({ type: 'ow_task_cta', detail: '[OW Task] Đã bấm CTA task trong info panel.' });
      } else {
        options.onLog?.({ type: 'ow_task_skip', detail: '[OW Task] Đã bấm Skip để sang bước tiếp.' });
      }
      return 1;
    }
  } catch {}
  return 0;
}

/**
 * Xử lý màn câu hỏi MUI (Material-UI): lựa chọn là các nút
 * `button[type="button"][data-tf-element-role="submit"][name]` trong container `#questionText`.
 * Chọn RANDOM một nút mỗi vòng quét (user chỉ rõ: random từ đầu tới cuối), click thật.
 *
 * @param {object} page Trang Playwright hiện tại.
 * @param {object} frame Frame đang quét.
 * @param {object} [options={}] Tùy chọn (onLog).
 * @return {Promise<number>} Số thao tác đã thực hiện.
 * @author coder-nguoi-tay
 * @since 2026-10-26
 */
export async function handleMuiQuestionButtons(page, frame, options = {}) {
  if (!frame || typeof frame.locator !== 'function') return 0;
  const now = Date.now();
  if (frame._uxMuiQHandledAt && (now - frame._uxMuiQHandledAt) < 2000) return 0;
  frame._uxMuiQHandledAt = now;

  const pick = await frame.evaluate(() => {
    // Màn MUI có #questionText và nhóm nút lựa chọn
    if (!document.querySelector('#questionText')) return null;
    const isVisible = (el) => {
      if (!el) return false;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 4 && r.height > 4;
    };
    const btns = Array.from(document.querySelectorAll('button[data-tf-element-role="submit"][name], button[type="button"] span.NJBjlW_feedbackLabel'))
      .map((el) => (el.closest('button') || el))
      .filter((b) => isVisible(b) && b.getAttribute('data-ux-mui-clicked') !== '1');
    if (btns.length < 2) return null;
    // User chỉ rõ: tự động chọn câu trả lời ĐẦU TIÊN của màn (không còn random)
    const chosen = btns[0];
    const uid = `ux-mui-${Math.random().toString(36).slice(2, 10)}`;
    chosen.setAttribute('data-ux-mui-mark', uid);
    return { uid, label: (chosen.innerText || chosen.getAttribute('name') || '').trim().slice(0, 40) };
  }).catch(() => null);

  if (!pick) return 0;
  try {
    const loc = frame.locator(`[data-ux-mui-mark="${pick.uid}"]`).first();
    if (await loc.count().catch(() => 0) > 0) {
      await frame.evaluate((uid) => {
        const el = document.querySelector(`[data-ux-mui-mark="${uid}"]`);
        if (!el) return;
        el.classList.remove('ai-pointer-events-none');
        el.style.pointerEvents = 'auto';
        let a = el.parentElement;
        while (a && a !== document.body) { a.style.visibility = 'visible'; a = a.parentElement; }
      }, pick.uid).catch(() => {});
      await page.bringToFront().catch(() => {});
      let clicked = await loc.click({ force: true, timeout: 3000 }).then(() => true).catch(() => false);
      if (!clicked) {
        const box = await loc.boundingBox().catch(() => null);
        if (box && box.width > 2 && box.height > 2) {
          await page.bringToFront().catch(() => {});
          await page.mouse.click(box.x + Math.min(box.width / 2, box.width - 3), box.y + Math.min(box.height / 2, box.height - 3), { delay: 20 }).catch(() => {});
          clicked = true;
        }
      }
      if (!clicked) return 0;
      await frame.evaluate((uid) => {
        const el = document.querySelector(`[data-ux-mui-mark="${uid}"]`);
        if (el) { el.setAttribute('data-ux-mui-clicked', '1'); el.removeAttribute('data-ux-mui-mark'); }
      }, pick.uid).catch(() => {});
      options.onLog?.({ type: 'mui_question_answered', detail: `[MUI Q] Đã chọn đáp án đầu tiên: "${pick.label}".` });
      return 1;
    }
  } catch {}
  return 0;
}

/**
 * Xử lý màn có nút "Skip" (`#skip_offer`) — gồm 2 biến thể:
 * 1) Màn "Continue Through Gmail" (nút Google OAuth + Skip): user chỉ định KHÔNG vào Google, bấm Skip.
 * 2) Màn choice-offer có "No Call / Skip Offer" (không có #questionText/#google_oauth_signup_button
 *    nên trượt cả handler MUI lẫn handler cũ) — cũng bấm Skip.
 * Nói chung: khi thấy `#skip_offer` hiện và chưa bấm → bấm Skip. Click thật, throttle 2s.
 *
 * @param {object} page Trang Playwright hiện tại.
 * @param {object} frame Frame đang quét.
 * @param {object} [options={}] Tùy chọn (onLog).
 * @return {Promise<number>} Số thao tác đã thực hiện.
 * @author coder-nguoi-tay
 * @since 2026-10-26
 */
export async function handleGoogleOauthSkip(page, frame, options = {}) {
  if (!frame || typeof frame.locator !== 'function') return 0;
  const now = Date.now();
  if (frame._uxGmailSkipHandledAt && (now - frame._uxGmailSkipHandledAt) < 2000) return 0;
  frame._uxGmailSkipHandledAt = now;

  const state = await frame.evaluate(() => {
    const skip = document.querySelector('#skip_offer');
    if (!skip) return null;
    const s = getComputedStyle(skip);
    if (s.display === 'none' || s.visibility === 'hidden') return null;
    const r = skip.getBoundingClientRect();
    if (r.width <= 2 || r.height <= 2) return null;
    if (skip.getAttribute('data-ux-gmail-skip-clicked') === '1') return null;
    skip.setAttribute('data-ux-gmail-skip-clicked', '1');
    const nameMatch = (document.querySelector('#questionText')?.innerText || document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 60);
    return { name: nameMatch };
  }).catch(() => null);

  if (!state) return 0;
  try {
    const loc = frame.locator('#skip_offer').first();
    if (await loc.count().catch(() => 0) > 0) {
      await frame.evaluate(() => {
        const el = document.querySelector('#skip_offer');
        if (!el) return;
        el.classList.remove('ai-pointer-events-none');
        el.style.pointerEvents = 'auto';
        el.style.visibility = 'visible';
        let a = el.parentElement;
        while (a && a !== document.body) { a.style.visibility = 'visible'; a = a.parentElement; }
      }).catch(() => {});
      await page.bringToFront().catch(() => {});
      let clicked = await loc.click({ force: true, timeout: 3000 }).then(() => true).catch(() => false);
      if (!clicked) {
        const box = await loc.boundingBox().catch(() => null);
        if (box && box.width > 2 && box.height > 2) {
          await page.bringToFront().catch(() => {});
          await page.mouse.click(box.x + Math.min(box.width / 2, box.width - 3), box.y + Math.min(box.height / 2, box.height - 3), { delay: 20 }).catch(() => {});
          clicked = true;
        }
      }
      if (clicked) {
        options.onLog?.({ type: 'gmail_oauth_skipped', detail: `[Skip] Màn có nút Skip "${state.name || ''}" — đã bấm Skip bỏ qua.` });
        return 1;
      }
    }
  } catch {}
  return 0;
}

const manualOpsRules = (() => {
  try {
    const rulesPath = join(process.env.HOME || '', 'Library', 'Application Support', 'AutoLeadPC-2', 'logs', 'manual-ops-rules.json');
    if (existsSync(rulesPath)) {
      const parsed = JSON.parse(readFileSync(rulesPath, 'utf8'));
      const freshWithin30Days = (Date.now() - new Date(parsed.updatedAt || 0).getTime()) < 30 * 24 * 3600 * 1000;
      if (freshWithin30Days && parsed.rules) {
        console.log(`[ManualOpsRules] Đã nạp luật từ phân tích thao tác tay (${parsed.updatedAt}).`);
        return parsed.rules;
      }
    }
  } catch {}
  return null;
})();

// Áp dụng tỉ lệ Yes/No theo luật phân tích thao tác tay (nếu có)
const twyPickNoRatio = (manualOpsRules && typeof manualOpsRules.twyYesRatio === 'number' && manualOpsRules.twyYesRatio >= 0 && manualOpsRules.twyYesRatio <= 1)
  ? (1 - manualOpsRules.twyYesRatio)
  : 0.3;

/**
 * Xử lý các thẻ khảo sát co-reg kiểu "twy" (Yes/No campaign card) trên trang offer:
 * - Chọn ngẫu nhiên 70% No / 30% Yes cho mỗi thẻ chưa trả lời.
 * - Nếu chọn Yes và xuất hiện subform (First/Last/Address/Zip/Dob/Phone/Email...) thì điền từ record.
 * - Bấm nút Continue của thẻ (#twy-buttonnext-...) để chuyển câu hỏi tiếp.
 *
 * @param {object} frame Frame đang quét.
 * @param {object} record Dữ liệu lead hiện tại.
 * @param {object} [options={}] Tùy chọn (onLog).
 * @return {Promise<number>} Số thẻ đã trả lời.
 * @author coder-nguoi-tay
 * @since 2026-10-25
 */
export async function handleTwyOfferCards(frame, record = {}, options = {}) {
  if (!frame || typeof frame.evaluate !== 'function') return 0;

  const parsedDob = parseDobComponents(getDobString(record));
  const personName = String(record.fullname || '').trim();
  const [firstPart = '', ...restParts] = personName.split(' ');
  const lastPart = restParts.join(' ');
  const dobText = parsedDob ? `${parsedDob.month}/${parsedDob.day}/${parsedDob.year}` : '';
  const payload = {
    first: String(record.firstname || firstPart || '').trim(),
    last: String(record.lastname || lastPart || '').trim(),
    email: String(record.email || record.mail || record.emailaddress || '').trim(),
    zip: String(record.zipcode || record.zip || record.postalcode || '').trim(),
    phone: String(record.phonenumber || record.phone || record.cellphone || '').trim(),
    dob: dobText,
    address: String(getAddressString(record)),
    city: String(record.city || record.town || ''),
    state: String(record.state || record.province || ''),
  };

  // Truyền ratio từ Node vào browser context qua args (biến Node không dùng được bên trong evaluate)
  const result = await frame.evaluate((args) => {
    const vals = args.vals;
    const twyPickNoRatioArg = args.ratio;
    const answered = [];
    const filledFields = [];
    let continueClicked = false;
    let answerSel = null;
    let answerValue = null;
    let continueSel = null;
    let genericNextSel = null;
    let thankyouSel = null;
    let finalText = null;
    let decidedContinue = false;

    const isVisible = (el) => {
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    // Bước B+: nếu có thẻ đã chọn Yes mà subform co-reg (ẨN NGOÀI card) còn trống → điền.
    // Quét toàn trang các input/select có twyfieldtype — vì subform không nằm trong thẻ con.
    const twyInputs = Array.from(document.querySelectorAll('input[twyfieldtype], select[twyfieldtype]'));
    const fillMap = (ft) => {
      if (/first/.test(ft)) return vals.first;
      if (/last/.test(ft)) return vals.last;
      if (/email/.test(ft)) return vals.email;
      if (/zip|postal/.test(ft)) return vals.zip;
      if (/phone|tel/.test(ft)) return vals.phone;
      if (/dob|birth/.test(ft)) return vals.dob;
      if (/address/.test(ft)) return vals.address;
      if (/city/.test(ft)) return vals.city;
      if (/state/.test(ft)) return vals.state;
      return '';
    };
    const anyYesAnswered = Array.from(document.querySelectorAll('input.twy-opt-yes:checked, input[id*="twyinputyes-"]:checked')).length > 0;
    if (anyYesAnswered) {
      for (const inp of twyInputs) {
        const ft = (inp.getAttribute('twyfieldtype') || inp.name || '').toLowerCase();
        if (!isVisible(inp)) continue;
        // Câu hỏi tùy chỉnh cq1/cq2...: chọn ngẫu nhiên một lựa chọn (không phải placeholder "None")
        // — đây là loại câu hỏi khiến Continue bị chặn td validation khi chưa chọn.
        if (/^cq\d+$/.test(ft)) {
          if (inp.tagName === 'SELECT') {
            if (inp.value) continue; // đã chọn
            const opts = Array.from(inp.options).filter((o) => o.value && !/none of the above/i.test(o.text));
            const pool = opts.length > 0 ? opts : Array.from(inp.options).filter((o) => o.value);
            if (pool.length > 0) {
              const chosen = pool[Math.floor(Math.random() * pool.length)];
              inp.value = chosen.value;
              inp.dispatchEvent(new Event('input', { bubbles: true }));
              inp.dispatchEvent(new Event('change', { bubbles: true }));
              filledFields.push(inp.name || inp.id);
            }
          } else if (inp.type === 'checkbox') {
            if (inp.checked) continue;
            // Trong một group checkbox cq, chỉ tick 1-2 ô ngẫu nhiên mỗi lượt
            inp.click();
            filledFields.push(inp.name || inp.id);
          }
          continue;
        }
        let fillVal = fillMap(ft);
        if (inp.tagName === 'SELECT') {
          const opt = Array.from(inp.options).find((o) =>
            String(o.value).toLowerCase() === fillVal.toLowerCase() || String(o.text).toLowerCase().includes(fillVal.toLowerCase()));
          if (opt && inp.value !== opt.value) { inp.value = opt.value; inp.dispatchEvent(new Event('change', { bubbles: true })); filledFields.push(inp.name || inp.id); }
        } else if (inp.type === 'checkbox') {
          if (!inp.checked) { inp.click(); filledFields.push(inp.name || inp.id); }
        } else if (inp.value !== fillVal) {
          inp.value = fillVal;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          filledFields.push(inp.name || inp.id);
        }
      }
    }

    // Bước A: trả lời CHỈ MỘT thẻ mỗi lượt (engine td xử lý tuần tự từng campaign;
    // bấm dồn nhiều thẻ trong cùng tick làm trạng thái preping="show" kẹt không hiện thẻ tiếp).
    // Nếu đã có thẻ chọn Yes mà subform vừa lộ ra còn thiếu giá trị → dành lượt này cho điền subform.
    const anyUnfilledVisibleSubform = anyYesAnswered && twyInputs.some((inp) => {
      const ft = (inp.getAttribute('twyfieldtype') || inp.name || '').toLowerCase();
      const v = fillMap(ft);
      return v && isVisible(inp) && inp.value !== v && inp.tagName !== 'SELECT';
    });

    // Các thẻ co-reg visible (dùng cho state log)
    const cards = Array.from(document.querySelectorAll('[class*="twy-campaign-container"], [id^="twy-campaign"]'))
      .filter((card) => isVisible(card));

    const pendingCard = cards.find((card) => {
        const yes = card.querySelector('input[id*="twyinputyes-"], .twy-opt-yes');
        const no = card.querySelector('input[id*="twyinputno-"], .twy-opt-no');
        if (!yes && !no) return false;
        const group = (yes || no).name || '';
        return !(group ? card.querySelector(`input[name="${group}"]:checked`) : null);
      });

    if (!(anyUnfilledVisibleSubform && pendingCard) && pendingCard) {
      const yes = pendingCard.querySelector('input[id*="twyinputyes-"], .twy-opt-yes');
      const no = pendingCard.querySelector('input[id*="twyinputno-"], .twy-opt-no');
      const pickNo = Math.random() < (typeof twyPickNoRatioArg === 'number' ? twyPickNoRatioArg : 0.3); // Yes/No ratio: ratio truyền từ Node qua tham số evaluate
      const target = (pickNo && no) ? no : yes;
      if (target && target.id) {
        answerSel = `#${CSS.escape(target.id)}`;
        answerValue = target.value;
      }
    }

    // Bước B2: chọn nút Continue co-reg để node bấm bằng chuột thật
    // (engine td chỉ nhận click chuột thật isTrusted; click JS bị bóng).
    const continueBtn = Array.from(document.querySelectorAll('[id^="twy-buttonnext-"], .twy-buttonnext, [class*="buttonnext"]'))
      .find((b) => isVisible(b));
    continueSel = continueBtn && continueBtn.id ? `#${CSS.escape(continueBtn.id)}` : null;

    // Bước C: nút Continue generic của funnel tự viết (path1e, path1d...)
    if (!continueSel && !genericNextSel) {
      for (const sel of ['.Buttons .Next a', 'li.Next > a', 'a.Next', '#twy-buttonnext', '.twy-buttonnext']) {
        const b = document.querySelector(sel);
        if (b && isVisible(b)) { genericNextSel = sel; break; }
      }
    }
    // Bước C+: fallback cuối: nút/lệnh có text "Continue/Next/Submit" đang hiển thị
    // (dạng nút tiếp tục cuối của các khảo sát co-reg như adsmith "forge" khi
    // đã trả lời hết các câu mà không còn selector chuẩn nào khớp)
    if (!continueSel && !genericNextSel && !thankyouSel) {
      const cands = Array.from(document.querySelectorAll('button, a, input[type="button"], input[type="submit"], [role="button"]'))
        .filter((b) => {
          if (!isVisible(b)) return false;
          if (b.disabled) return false;
          const txt = String((b.innerText || b.value || b.textContent || '')).trim().toLowerCase();
          if (!/^(continue|next|submit|done|get my results|finish|tiếp tục|hoàn thành)\b/.test(txt)) return false;
          if (/privacy|terms|policy|copyright/.test(txt)) return false;
          const href = (b.getAttribute && b.getAttribute('href')) || '';
          if (href.startsWith('mailto:') || href.startsWith('tel:')) return false;
          // hợp lệ nếu nút thuộc vùng câu hỏi/khảo sát/thân trang, không phải menu
          return true;
        });
      const finalBtn = cands[0] || null;
      if (finalBtn) {
        finalText = String((finalBtn.innerText || finalBtn.value || '')).trim().slice(0, 30);
        if (finalBtn.id) continueSel = `#${CSS.escape(finalBtn.id)}`;
        else {
          // Đặt data-attr để node bật bằng Playwright theo selector duy nhất
          const uid = `ux-continue-${Math.random().toString(36).slice(2, 9)}`;
          finalBtn.setAttribute('data-ux-continue', uid);
          continueSel = `[data-ux-continue="${uid}"]`;
        }
      }
    }

    // Bước D: trang Thank-you của funnel — bấm nút quay về trang gốc
    const thankBtn = document.querySelector('.thankyou-button, a.thankyou-actions a, [class*="thankyou"] .thankyou-button');
    if (thankBtn && isVisible(thankBtn)) {
      thankyouSel = thankBtn.id ? `#${CSS.escape(thankBtn.id)}` : '.thankyou-button';
    }

    return {
      answered, filledFields, continueClicked,
      answerSel, answerValue, continueSel, genericNextSel, thankyouSel,
      decidedContinue,
      state: {
        visibleCards: cards.length,
        pendingCardId: pendingCard ? (pendingCard.querySelector('input[id*="twyinputyes-"]')?.id || pendingCard.id || '?') : null,
        yesCheckedCount: Array.from(document.querySelectorAll('input.twy-opt-yes:checked, input[id*="twyinputyes-"]:checked')).length,
        subformVisible: anyUnfilledVisibleSubform,
        continueBtnId: continueBtn ? continueBtn.id : null,
      },
    };
  }, { vals: payload, ratio: twyPickNoRatio }).catch((twyE) => {
    // Không để handler co-reg chết âm thầm — log nguyên nhân evaluate lỗi
    options.onLog?.({
      type: 'twy_error',
      detail: `[Survey] Lỗi xử lý thẻ co-reg: ${String(twyE && twyE.message ? twyE.message : twyE).slice(0, 120)}`,
    });
    return null;
  });

  /**
   * Bấm chuột thật lên selector trong frame (engine td cần isTrusted click).
   *
   * @param {string} sel Selector CSS cần bấm.
   * @return {Promise<boolean>} true nếu click chuột thật thành công.
   * @author coder-nguoi-tay
   * @since 2026-10-25
   */
  const realClick = async (sel) => {
    if (!sel) return false;
    let clicked = false;
    try {
      const page = typeof frame.page === 'function' ? frame.page() : null;
      if (page && typeof page.bringToFront === 'function') {
        await page.bringToFront().catch(() => {});
      }
      await frame.locator(sel).first().click({ force: true, timeout: 4000 }).catch(() => {});
      clicked = true;
    } catch {}
    // Fallback: click JS nếu chuột thật không thực hiện được (selector rung giữa chừng)
    if (!clicked) {
      await frame.evaluate((s) => {
        const el = document.querySelector(s);
        if (el) { el.click(); return true; }
        return false;
      }, sel).catch(() => false);
    }
    return true;
  };

  // Bấm chuột thật: câu trả lời → rồi Continue (đúng trình tự "bấm vào frame → trả lời → tiếp tục")
  let realAnswered = false;
  if (result?.answerSel) {
    await realClick(result.answerSel);
    realAnswered = true;
    result.answered.push({ id: result.answerSel, value: result.answerValue });
  }
  // Continue co-reg: chỉ bấm khi không còn thẻ pending HOẶC vừa trả lời xong thẻ đó
  if (result?.continueSel && (result.state?.pendingCardId === null || realAnswered)) {
    await realClick(result.continueSel);
    result.continueClicked = true;
    if (result.finalText) result.filledFields.push(`(${result.finalText})`);
  } else if (!result?.continueSel && result?.genericNextSel) {
    await realClick(result.genericNextSel);
    result.continueClicked = true;
  }
  // Trang Thank-you: bấm nút quay về trang gốc
  if (result?.thankyouSel) {
    await realClick(result.thankyouSel);
    result.continueClicked = true;
  }

  let total = 0;
  if (result && result.state) {
    // Luôn log trạng thái co-reg để chẩn đoán khi trang đứng (giới hạn 1 lần/10s mỗi frame)
    const now = Date.now();
    if (!frame._uxTwyStateAt || (now - frame._uxTwyStateAt) > 10000 || result.answered.length > 0) {
      frame._uxTwyStateAt = now;
      options.onLog?.({
        type: 'twy_state',
        detail: `[Survey] Trạng thái co-reg: cards=${result.state.visibleCards} pending=${result.state.pendingCardId || 'none'} yesChecked=${result.state.yesCheckedCount} subformVisible=${result.state.subformVisible} continueBtn=${result.state.continueBtnId || 'none'}`,
      });
    }
  }
  if (result && Array.isArray(result.answered) && result.answered.length > 0) {
    total += result.answered.length;
    for (const a of result.answered) {
      options.onLog?.({
        type: 'twy_card_answered',
        field: a.id,
        detail: `[Survey] Đã trả lời thẻ co-reg #${a.id}: chọn "${a.value}" (random 70% Yes / 30% No)`,
      });
    }
  }
  if (result && Array.isArray(result.filledFields) && result.filledFields.length > 0) {
    options.onLog?.({
      type: 'field_filled',
      detail: `[Survey] Đã điền ${result.filledFields.length} ô subform co-reg từ record: ${result.filledFields.slice(0, 8).join(', ')}`,
    });
  }
  if (result && result.continueClicked) {
    options.onLog?.({ type: 'submit_clicked', detail: `[Survey] Đã bấm nút Continue co-reg để chuyển câu hỏi tiếp theo.` });
  }
  return total;
}

/**
 * Tự động chọn đáp án khảo sát từ radio hoặc thẻ HTML có class/id thể hiện answer, option, choice, response, kể cả ngoài form.
 * Hỗ trợ giao diện khảo sát và quiz dùng nút, link hoặc thẻ HTML thông thường.
 *
 * @param {object} frame Frame Playwright đang quét.
 * @param {object} [record={}] Bản ghi dữ liệu hiện tại để ưu tiên nếu có cấu hình.
 * @param {object|null} session Phiên browser nhận trạng thái autofill.
 * @return {Promise<number>} Số câu hỏi đã được chọn/trả lời.
 * @throws {Error} Lỗi thao tác frame được xử lý tại chỗ và không làm dừng phiên.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-21 02:28:13 +07:00
 */
export async function handleRadioAndSurveyOptions(frame, record = {}, session = null) {
  let answeredCount = 0;
  // Domain-specific strategy based on log analysis (from browser-logs.json + HTML snapshots)
  const currentUrl = typeof frame.url === 'function' ? frame.url() : '';
  const isUplevel = currentUrl.includes('uplevelrewards.com');
  const isDisplayOpt = currentUrl.includes('displayoptoffers.com');
  const isReward4Spot = currentUrl.includes('reward4spot.com');
  const isMercyShips = currentUrl.includes('mercyships.org');

  // UplevelRewards: survey q1-q3 (Yes / Use it myself / Weekly)
  if (isUplevel) {
    try {
      const upLevelRes = await frame.evaluate(() => {
        let clicks = 0;
        const screens = document.querySelectorAll('section.screen[data-screen="q1"], section.screen[data-screen="q2"], section.screen[data-screen="q3"]');
        for (const screen of screens) {
          const options = screen.querySelectorAll('a.option, button.option, [class*="option"]');
          if (options.length === 0) continue;
          // Prefer "Yes" / "Use it myself" / "Weekly" by text
          const text = screen.dataset.screen || '';
          let target = null;
          for (const opt of options) {
            const t = (opt.textContent || '').trim().toLowerCase();
            if (text === 'q1' && /yes/i.test(t)) { target = opt; break; }
            if (text === 'q2' && /myself/i.test(t)) { target = opt; break; }
            if (text === 'q3' && /weekly/i.test(t)) { target = opt; break; }
          }
          if (!target) target = options[0];
          if (target) { target.click(); clicks++; }
        }
        return clicks;
      });
      if (upLevelRes > 0) {
        answeredCount += upLevelRes;
        console.log(`[UplevelRewards] Đã chọn ${upLevelRes} câu trả lời khảo sát theo strategy.`);
      }
    } catch {}
  }

  // DisplayOptOffers: tích checkbox consent, không điền form
  if (isDisplayOpt) {
    try {
      const consentRes = await frame.evaluate(() => {
        let checked = 0;
        const cbs = document.querySelectorAll('input[type="checkbox"][name*="consent"], input[type="checkbox"][name*="agree"], input[type="checkbox"][id*="consent"]');
        for (const cb of cbs) {
          if (!cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); checked++; }
        }
        return checked;
      });
      if (consentRes > 0) {
        answeredCount += consentRes;
        console.log(`[DisplayOptOffers] Đã tích ${consentRes} ô consent.`);
      }
    } catch {}
  }

  // Reward4Spot: bấm nút CONTINUE (ski next)
  if (isReward4Spot) {
    try {
      const continueBtn = frame.locator('a.ski.next, button#v37-deal-go, div.btn:has-text("Continue")').first();
      if ((await continueBtn.count().catch(() => 0)) > 0) {
        await continueBtn.click({ force: true, timeout: 2000 }).catch(() => {});
        answeredCount += 1;
        console.log(`[Reward4Spot] Đã bấm nút CONTINUE.`);
      }
    } catch {}
  }

  // MercyShips: bấm accordion "Where does my donation go to?"
  if (isMercyShips) {
    try {
      const accordionBtn = frame.locator('button.accordion-button:has-text("Where does my donation go to?")').first();
      if ((await accordionBtn.count().catch(() => 0)) > 0) {
        await accordionBtn.click({ force: true, timeout: 2000 }).catch(() => {});
        answeredCount += 1;
        console.log(`[MercyShips] Đã bấm accordion donate info.`);
      }
    } catch {}
  }

  // 0. ƯU TIÊN CAO NHẤT: Đáp ứng yêu cầu "chủ động bấm nút trong btn-option" và "các phần trả lời đáp án chọn random trong danh sách các id='btn-option' cứ hiện là chọn"
  // Tự động tìm tất cả đáp án có id="btn-option", id/class chứa "btn-option" HOẶC CÁC NÚT BÊN TRONG btn-option, gom nhóm và chọn ngay khi xuất hiện
  try {
    const btnOptionGroups = await frame.evaluate(() => {
      const isVisible = (el) => {
        if (!el || el.disabled) return false;
        const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
        if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return false;
        if (el.closest('[aria-hidden="true"], [inert], .inactive, .hidden, .hide, .step:not(.active):not(.current), .tab-pane:not(.active)')) return false;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        return true;
      };

      const rawCandidates = Array.from(document.querySelectorAll([
        '[id="btn-option"]',
        '[id^="btn-option"]',
        '[id*="btn-option"]',
        '[id*="btn_option"]',
        '.btn-option',
        '.btn_option',
        '[class*="answer" i]',
        '[class*="option" i]',
        '[class*="choice" i]',
        '[class*="response" i]',
        '[id*="answer" i]',
        '[id*="option" i]',
        '[id*="choice" i]',
        '[id*="response" i]',
        '[class*="btn-yes" i]',
        '[class*="btn-no" i]',
        '[class*="yes-btn" i]',
        '[class*="no-btn" i]',
        '[data-btn-option]',
        'button.btn-option',
        'a.btn-option',
        // Các thẻ <a> là link câu trả lời khảo sát / trắc nghiệm nhảy trang:
        'a.choice',
        'a.choice-btn',
        'a.option-btn',
        'a.answer-btn',
        'a.quiz-btn',
        'a.creative-survey-answer',
        'a[data-vector-answer="true"]',
        'a[data-choice]',
        'a[data-answer]',
        'a[data-option]',
        'a.primary-btn',
        'a.offer-click-tracking-no-link',
        // Các thẻ <a> hoặc button nằm trong container câu hỏi khảo sát:
        '.choices a',
        '.answers a',
        '.options a',
        '.survey-question a',
        '.question a',
        '.choice-container a',
        '.options-container a',
        '.card-options a',
        '.options-grid a',
        '.quiz-step a',
        '.survey-step a',
        '.quiz-container a',
        '.survey-card a',
        '.options-list a',
        '.step-container a',
        // Các nút bấm & lựa chọn của LocoTomato Widget nhúng:
        '.loco-btn',
        '.loco-option',
        '.loco-choice',
        '[data-loco-option]',
        '[data-loco-choice]',
        '[data-loco-value]',
        'button.loco-btn',
        'a.loco-btn',
        '[data-loco-role="option"]',
        '[data-loco-role="choice"]',
        '[data-loco-action="next"]',
        '[data-loco-action="select"]',
        '.loco-widget button',
        '.loco-widget a',
        '.choices button:not([type="submit"])',
        '.answers button:not([type="submit"])',
        '.options button:not([type="submit"])',
        '.survey-question button:not([type="submit"])',
        '.question button:not([type="submit"])',
        // Alpha Intent / LaunchPotato Funnel câu hỏi trắc nghiệm & lựa chọn:
        '.question-answers > button:not([type="submit"]):not(.ai-submit-button)',
        '.question-answers button:not([type="submit"]):not(.ai-submit-button)',
        '.yes-no-button-container > button',
        '.offer-buttons > button:not([type="submit"]):not(.ai-submit-button)',
        '.make-buttons > button',
        '.model-buttons > button',
        '.year-buttons > button',
        '.ai-button-container--question button:not(.ai-submit-button)',
        'button[data-testid*="answer"]',
        'button[data-testid*="option"]',
        // Các loại quiz cards, survey cards, choice cards, option cards:
        '.choice-card',
        '.option-card',
        '.answer-card',
        '.quiz-card',
        '.survey-card',
        '.quiz-option',
        '.survey-option',
        '.answer-option',
        '.choice-option',
        '.selection-card',
        '.selection-button',
        '.selection-item',
        '.card-choice',
        '.card-option',
        '.pill-option',
        '.bubble-option',
        '[data-choice]',
        '[data-answer]',
        '[data-option]',
        '[data-response]',
        '[data-vector-answer="true"]',
        '[data-element-type="survey_answer"]',
        '[role="option"]',
        'button.qualifier-option-button',
        '.creative-survey-answer',
        '[role="radio"]',
        // Các nút bấm con nằm BÊN TRONG container btn-option:
        '#btn-option button',
        '#btn-option a',
        '#btn-option [role="button"]',
        '#btn-option input[type="button"]',
        '#btn-option input[type="submit"]',
        '#btn-option > div',
        '#btn-option > li',
        '#btn-option label',
        '[id*="btn-option"] button',
        '[id*="btn-option"] a',
        '[id*="btn-option"] [role="button"]',
        '[id*="btn-option"] input',
        '[id*="btn-option"] > div',
        '[id*="btn-option"] > li',
        '[id*="btn-option"] label',
        '.btn-option button',
        '.btn-option a',
        '.btn-option [role="button"]',
        '.btn-option input',
        '.btn-option > div',
        '.btn-option > li',
        '.btn-option label',
        '[id*="btn_option"] button',
        '[id*="btn_option"] a',
        '.btn_option button',
        '.btn_option a',
        // Các nút trong choice-container hoặc options-container
        '.choice-container button:not([type="submit"])',
        '.choice-container a',
        '.choice-container [role="button"]',
        '.options-container button:not([type="submit"])',
        '.options-container a',
        '.options-container [role="button"]',
      ].join(', ')));

      const isNoiseOption = (el) => {
        if (!el) return true;
        const text = (el.innerText || el.textContent || el.value || '').trim().toLowerCase();
        const href = (el.getAttribute ? el.getAttribute('href') : '') || '';
        const idAndClass = `${el.id || ''} ${el.className || ''}`
          .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
          .toLowerCase();
        const role = (el.getAttribute && el.getAttribute('role') || '').toLowerCase();
        const isInteractive = /^(a|button|input|label)$/i.test(el.tagName || '') ||
          ['button', 'option', 'radio'].includes(role) || el.tabIndex >= 0 || typeof el.onclick === 'function';
        if (!isInteractive && /(?:^|[\s_-])(text|title|description|icon|caption|heading|copy|label)(?:$|[\s_-])/.test(idAndClass)) return true;
        if (/(?:^|[\s_-])(container|wrapper|list|group|grid|section|step|widget|form|panel)(?:$|[\s_-])/.test(idAndClass)) return true;

        // 1. Kiểm tra nếu nằm trong container câu hỏi khảo sát / quiz / choices rõ ràng
        const inSurveyContainer = Boolean(el.closest && el.closest('.question, .survey-question, .choices, .answers, .options, .choice-container, .options-container, .quiz-step, .survey-step, [id*="btn-option"], .btn-option, .survey-card, .quiz-card, .quiz-container, .selection-card, .card-options, .options-grid, .loco-widget, .loco-card, .loco-step, .loco-question, .loco-form, [data-loco-widget], fieldset'));

        // 2. Pháp lý / điều khoản (privacy, terms...) — regex dùng chung tại survey-solver.mjs
        if (SURVEY_LEGAL_NOISE_RE.test(text) || (!inSurveyContainer && (SURVEY_LEGAL_NOISE_RE.test(href) || SURVEY_LEGAL_NOISE_RE.test(idAndClass)))) return true;

        // 3. Menu điều hướng: Chỉ kiểm tra trên text hiển thị của nút để tránh lọc nhầm link khảo sát dẫn tới /register hoặc /signup
        const navTextNoise = /^(sign\s*in|login|log\s*in|my\s*account|home|homepage|main\s*menu|menu|cart|shopping\s*cart|portal|contact\s*us|about\s*us|help\s*&\s*faq|faqs?)$/i;
        if (navTextNoise.test(text)) return true;
        if (!inSurveyContainer) {
          // Regex dùng chung tại survey-solver.mjs (SURVEY_NAV_NOISE_RE)
          if (SURVEY_NAV_NOISE_RE.test(text) || SURVEY_NAV_NOISE_RE.test(idAndClass)) return true;
        }

        if (href.startsWith('mailto:') || href.startsWith('tel:')) return true;
        if (/^(cancel|back|previous|prev|quay lại|hủy|bỏ qua)$/i.test(text)) return true;

        return false;
      };

      const uniqueElements = Array.from(new Set(rawCandidates));
      const allCandidates = uniqueElements.filter((el) => {
        if (!isVisible(el)) return false;
        if (isNoiseOption(el)) return false;
        if (el.closest('.offerwall-card, form[data-tf-element-role="offer"], .offerwall-card-wrap')) return false;
        // Bỏ qua wrapper khi bên trong đã có một đáp án cụ thể hơn.
        const hasAnswerChild = uniqueElements.some((child) => child !== el && el.contains(child) && !isNoiseOption(child));
        if (hasAnswerChild) return false;
        return true;
      });

      if (!allCandidates.length) return [];

      // Gom theo nhóm câu hỏi; nếu class lạ thì tìm tổ tiên gần nhất chứa từ hai đáp án.
      const groups = new Map();
      const now = Date.now();
      const questionGroupSelector = [
        '.question', '.survey-question', 'fieldset', '.choice-container', '.options-container',
        '.quiz-step', '.question-container', '.survey-step', '[role="radiogroup"]', '[role="group"]',
        '.choices', '.answers', '.quiz-container', '.survey-card', '.question-wrap', '.question-wrapper',
        '.quiz-question', '.survey-group', '.answers-container', '.poll-question', '.form-question',
        '.survey-block', '.step-content', '.survey-slide', '.answer-group', '.option-group', '.choice-group',
        '.answer-list', '.option-list', '.choice-list', '.response-group', '[class*="answers" i]', '[class*="options" i]',
        '[class*="choices" i]', '[data-question]', '[data-question-id]', '[id*="btn-option"]', '.btn-option',
      ].join(', ');

      allCandidates.forEach((btn, idx) => {
        let answerGroupContainer = null;
        const knownQuestionGroup = btn.parentElement?.closest(questionGroupSelector);
        if (knownQuestionGroup && allCandidates.filter((candidate) => knownQuestionGroup.contains(candidate)).length > 1) {
          answerGroupContainer = knownQuestionGroup;
        }
        if (!answerGroupContainer) {
          let answerGroupAncestor = btn.parentElement;
          while (answerGroupAncestor && answerGroupAncestor !== document.body) {
            if (allCandidates.filter((candidate) => answerGroupAncestor.contains(candidate)).length > 1) {
              answerGroupContainer = answerGroupAncestor;
              break;
            }
            answerGroupAncestor = answerGroupAncestor.parentElement;
          }
        }
        answerGroupContainer ||= btn.parentElement || document.body;
        if (!groups.has(answerGroupContainer)) {
          groups.set(answerGroupContainer, []);
        }
        const uid = `btn_option_${idx}_${now}`;
        btn.setAttribute('data-ux-btn-option-id', uid);

        const isSelected = btn.classList.contains('active') ||
          btn.classList.contains('selected') ||
          btn.classList.contains('checked') ||
          btn.classList.contains('chosen') ||
          btn.getAttribute('aria-checked') === 'true' ||
          btn.getAttribute('aria-selected') === 'true' ||
          btn.getAttribute('data-ux-clicked') === '1' ||
          (btn.tagName === 'INPUT' && btn.checked) ||
          btn.querySelector('input:checked') !== null ||
          (btn.id ? Boolean(document.querySelector(`input#${btn.id}:checked`)) : false);

        const lastClickedTime = Number(btn.getAttribute('data-ux-btn-clicked-time') || 0);
        const recentlyClicked = (now - lastClickedTime) < 5000;

        groups.get(answerGroupContainer).push({
          uid,
          id: btn.id || '',
          className: btn.className || '',
          text: (btn.innerText || btn.textContent || btn.value || '').trim(),
          isSelected,
          recentlyClicked,
        });
      });

      const actionableGroups = [];
      for (const [container, items] of groups.entries()) {
        const hasRecentlyClicked = items.some((it) => it.recentlyClicked);
        const hasSelected = items.some((it) => it.isSelected);
        // QUAN TRỌNG: Chỉ chọn khi nhóm này CHƯA có đáp án nào được chọn (isSelected)
        // và CHƯA từng được click gần đây, tránh click đi click lại 1 nút mở nhiều link
        if (!hasRecentlyClicked && !hasSelected && items.length > 1) {
          // Kèm tiêu đề câu hỏi để signature phân biệt được các bước Yes/No liên tiếp
          // trên cùng một URL (cùng câu hỏi rebuild DOM → chặn, câu khác → cho phép).
          const headingEl = container.querySelector('h1, h2, h3, h4, legend, .question-title, .main-question, p');
          const heading = ((headingEl?.innerText || headingEl?.textContent || '') || '').trim();
          actionableGroups.push({ source: 'btn_option', heading, items });
        }
      }

      return actionableGroups;
    }).catch(() => []);

    for (const groupEntry of btnOptionGroups) {
      // Contract: mỗi entry là { source: 'btn_option', heading, items } trả về từ evaluate phía trên.
      // Dữ liệu không đúng shape (mock/trả lẫn từ khối khác) thì bỏ qua an toàn.
      if (groupEntry?.source !== 'btn_option') continue;
      const groupHeading = groupEntry.heading ?? '';
      const group = groupEntry.items;
      if (!Array.isArray(group) || !group.length) continue;
      // Signature dựa trên pagePath + câu hỏi + options: chặn re-click khi DOM bị
      // rebuild (attribute per-element "" mất theo DOM, chỉ chặn được 5s).
      const groupSignature = buildSurveyAnswerSignature(frame, groupHeading, group);
      if (isSurveyAnswerHandled(frame, groupSignature)) continue;
      // Chọn ngẫu nhiên 1 đáp án trong danh sách các btn-option
      const picked = group[Math.floor(Math.random() * group.length)];
      if (picked?.uid) {
        try {
          const locator = frame.locator(`[data-ux-btn-option-id="${picked.uid}"]`).first();
          if (locator && (await locator.count().catch(() => 0) > 0)) {
            if (typeof locator.scrollIntoViewIfNeeded === 'function') {
              await locator.scrollIntoViewIfNeeded({ timeout: 400 }).catch(() => {});
            }

            const activePage = typeof frame.page === 'function' ? frame.page() : null;
            const isRealBrowser = Boolean(activePage?.mouse && typeof activePage.mouse.move === 'function');
            if (isRealBrowser) {
              const readPause = Math.floor(Math.random() * 120) + 120;
              await new Promise((r) => setTimeout(r, readPause));
              if (Math.random() < 0.25) {
                await naturalMouseDrift(activePage, 1);
              }
            }
            let domClickFallbackUsed = false;
            const clickedPhysically = await humanClick(activePage, locator);
            if (!clickedPhysically) {
              try {
                await locator.click({ force: true, timeout: 1200 });
              } catch {
                try {
                  await locator.evaluate((el) => el.click());
                  domClickFallbackUsed = true;
                } catch {}
              }
            }

            await locator.evaluate((el, shouldNavigate) => {
              const now = Date.now();
              el.setAttribute('data-ux-btn-clicked-time', String(now));
              el.setAttribute('data-ux-clicked', '1');
              el.classList.add('selected', 'active');
              // Chỉ ép nhảy trang bằng href khi click thật không thực hiện được (DOM fallback).
              // Click thật điều hướng sẵn rồi — ép lại gây điều hướng 2 lần.
              if (shouldNavigate && el.tagName && el.tagName.toLowerCase() === 'a' && el.href && !el.href.startsWith('javascript:') && !el.href.startsWith('#')) {
                try { window.location.href = el.href; } catch {}
              }
            }, domClickFallbackUsed).catch(() => {});

            answeredCount += 1;
            if (session) {
              session.lastActionTime = Date.now();
              addActionCount(session, 1);
              // Click đáp án KHÔNG được tính là submit — chỉ ghi pending; bộ đếm màn
              // (completedScreens) chỉ tăng khi trang THỰC SỰ chuyển sang màn khác.
              session.answerClickPending = true;
            }
            markSurveyAnswerHandled(frame, groupSignature);
          }
        } catch {}
      }
    }
  } catch {}

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

      // Nếu không khớp trong record, chọn lựa chọn ĐẦU TIÊN (nhanh, không cần đúng)
      if (!chosen) {
        chosen = group.items[0];
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
            await radioLocator.scrollIntoViewIfNeeded({ timeout: 600 }).catch(() => {});
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
        '[id="btn-option"]',
        '[id^="btn-option"]',
        '[id*="btn-option"]',
        '.btn-option',
        'button.btn-option',
        'a.btn-option',
        'a.choice',
        'a.choice-btn',
        'a.option-btn',
        'a.answer-btn',
        'a.quiz-btn',
        'a.creative-survey-answer',
        'a[data-vector-answer="true"]',
        'a[data-choice]',
        'a[data-answer]',
        'a[data-option]',
        'button[data-vector-answer="true"]',
        'button[data-element-type="survey_answer"]',
        'button[name="selected_answer"]',
        'button[name="survey_answer"]',
        'button[data-action="answer_survey"]',
        'button.qualifier-option-button',
        '.creative-survey-answer',
        'a.primary-btn',
        'a.offer-click-tracking-no-link',
        'button.question-answer-button:not(.submit-button):not(.ai-submit-button):not([id="submit-button"]):not([data-tf-element-role="submit"])',
        'button[id^="answer-"]:not(.submit-button):not(.ai-submit-button):not([id="submit-button"]):not([data-tf-element-role="submit"])',
        '.question-answer-cta-text:not(.submit-button):not(.ai-submit-button):not([id="submit-button"]):not([data-tf-element-role="submit"])',
        '.ai-button--question:not(.ai-submit-button):not(.submit-button):not([id="submit-button"]):not([data-tf-element-role="submit"])',
        'button[name="question-answer"]:not(.submit-button):not(.ai-submit-button):not([id="submit-button"]):not([data-tf-element-role="submit"])',
        '.question-answers button:not(.ai-submit-button):not(.submit-button):not([id="submit-button"]):not([data-tf-element-role="submit"])',
        'button[data-answer-id]:not(.submit-button):not(.ai-submit-button):not([id="submit-button"]):not([data-tf-element-role="submit"])',
        '.ai-button-content-text:not(.submit-button):not(.ai-submit-button):not([id="submit-button"]):not([data-tf-element-role="submit"])',
        '.answer-button:not(.submit-button):not(.ai-submit-button):not(.offerwall-btn)',
        '.survey-answer:not(.submit-button):not(.ai-submit-button):not(.offerwall-btn)',
        '.option-button:not(.submit-button):not(.ai-submit-button):not(.offerwall-btn)',
        'div[role="button"][data-answer]:not(.offerwall-btn)',
        'div[role="button"][data-option]:not(.offerwall-btn)',
        'button:not([type="submit"]):not(.btn-submit):not(.submit-button):not(.ai-submit-button):not([id="submit-button"]):not([data-tf-element-role="submit"]):not(.faq-trigger):not(.offerwall-btn)',
        '[role="radio"]',
        '[role="button"]:not(.btn-submit):not(.submit-button):not(.ai-submit-button):not([id="submit-button"]):not([data-tf-element-role="submit"]):not(.offerwall-btn)',
        '.option-btn, .choice-btn, .quiz-btn, .answer-btn, label.btn',
        '.options-container a',
        '.choice-container a',
        '.choices a',
        '.answers a',
        '.options a',
        'a.option',
        '.option',
        'a[data-next]',
        '[data-next]',
        '.survey-question a',
        '.question a',
        'button.loco-btn',
        'a.loco-btn',
        '.loco-btn',
        '.loco-option',
        '.loco-choice',
        '[data-loco-option]',
        '[data-loco-value]',
      ].join(', ');

      const isVisible = (el) => {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        return Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      };

      const containerSelector = [
        '.options-container',
        '.card-options',
        '.choice-container',
        '.options',
        'section.screen.is-active',
        '.screen.is-active',
        '.options-grid',
        'div[role="radiogroup"]',
        '.choices',
        '.survey-question',
        '.options-list',
        'fieldset',
        '[data-element-type="survey_question"]',
        '.question',
        '.creative',
        '.quiz-step',
        '.survey-step',
        '.step-container',
        '.creative-survey',
        '.survey-form',
        '.quiz-container',
        '.survey-card',
        '.questions-container',
        '.loco-widget',
        '.loco-card',
        '.loco-step',
        '.loco-question',
        '.loco-form',
        '[data-loco-widget]',
        '.ai-content--question',
        '.question-object',
        '.question-answers',
        '#question-answers',
        '[data-object-type="question"]',
        '.ai-button-container--question',
        '.ai-button-container',
        '.yes-no-answers',
        '.multi-select',
        '.ai-button-container--multiselect',
      ].join(', ');

      const containers = Array.from(document.querySelectorAll(containerSelector));

      containers.forEach((container, groupIndex) => {
        if (!isVisible(container)) return;

        // Bỏ qua container cha nếu nó bao bọc một container con khác để tránh bắt nhầm toàn bộ page
        const hasChildContainer = containers.some((other) => other !== container && container.contains(other));
        if (hasChildContainer) return;

        // Bỏ qua nếu bên trong chứa các input thông thường cần điền (tránh nhầm với form điền)
        if (container.querySelector('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])')) return;

        // Bỏ qua nếu thuộc Offerwall Card
        if (container.closest('.offerwall-card, form[data-tf-element-role="offer"], .offerwall-card-wrap')) return;

        const candidateOptions = Array.from(container.querySelectorAll(optionSelector)).filter(isVisible);
        if (candidateOptions.length < 2) return;

        // Kiểm tra xem đã có nút nào ĐANG HIỂN THỊ trong container này được click hoặc đang active
        const alreadyActive = candidateOptions.some((b) =>
          b.classList.contains('active') ||
          b.classList.contains('selected') ||
          b.getAttribute('aria-checked') === 'true' ||
          b.getAttribute('data-ux-clicked') === '1'
        );
        if (alreadyActive) return;

        const titleEl = container.querySelector('h1, h2, h3, h4, .main-question, .survey-label, .creative-survey-question, legend, .question-title, p') ||
          container.closest('.question-object, .ai-content--question, [data-object-type="question"], .mock-offer-page')?.querySelector('h1, h2, h3, h4, .question-title, .ai-headline--question, legend, p') ||
          container.parentElement?.querySelector('h1, h2, h3, h4, .question-title, .ai-headline--question, legend, p');
        const questionTitle = (titleEl?.innerText || titleEl?.textContent || '').trim();

        const items = [];
        candidateOptions.forEach((btn, optIndex) => {
          const uid = `choice_${groupIndex}_${optIndex}_${Date.now()}`;
          btn.setAttribute('data-ux-choice-id', uid);
          const rawText = (
            btn.querySelector('.option__label')?.textContent ||
            btn.innerText ||
            btn.textContent ||
            btn.querySelector('[data-value]')?.getAttribute('data-value') ||
            btn.querySelector('.question-answer-cta-span, .ai-button-text, .button-text')?.textContent ||
            btn.value ||
            ''
          ).trim();
          const rawVal = btn.getAttribute('data-value') ||
            btn.querySelector('[data-value]')?.getAttribute('data-value') ||
            btn.getAttribute('data-vector-field-value') ||
            btn.getAttribute('value') ||
            btn.getAttribute('data-option-id') ||
            btn.getAttribute('data-answer-id') ||
            btn.querySelector('[data-answer-id]')?.getAttribute('data-answer-id') ||
            '';
          items.push({
            uid,
            id: btn.id || '',
            text: rawText,
            value: rawVal,
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
        const standaloneVectorButtons = Array.from(document.querySelectorAll(
          '[id="btn-option"], [id^="btn-option"], [id*="btn-option"], .btn-option, button[data-vector-answer="true"], button.btn-option, button[name="selected_answer"], button[name="survey_answer"], button.creative-survey-answer, button[data-action="answer_survey"], button.qualifier-option-button'
        )).filter(isVisible);
        if (standaloneVectorButtons.length >= 2) {
          const alreadyActive = standaloneVectorButtons.some((b) =>
            b.classList.contains('active') ||
            b.classList.contains('selected') ||
            b.getAttribute('data-ux-clicked') === '1'
          );
          if (!alreadyActive) {
            const heading = (document.querySelector('h1, h2, h3, h4, .main-question, .survey-question-text, .question, legend')?.innerText || 'vector_survey').trim();
            results.push({
              questionTitle: heading,
              items: standaloneVectorButtons.map((btn, optIndex) => {
                const uid = `choice_vec_${optIndex}_${Date.now()}`;
                btn.setAttribute('data-ux-choice-id', uid);
                return {
                  uid,
                  id: btn.id || '',
                  text: (btn.innerText || btn.textContent || btn.value || '').trim(),
                  value: btn.getAttribute('data-vector-field-value') || btn.getAttribute('value') || '',
                  field: btn.getAttribute('data-vector-field') || btn.getAttribute('name') || '',
                  tagName: btn.tagName.toLowerCase(),
                };
              }),
            });
          }
        }
      }

      if (!results.length) {
        const allButtons = Array.from(document.querySelectorAll('button:not([type="submit"]):not(.btn-submit):not(.faq-trigger):not(.offerwall-btn), [role="button"]:not(.btn-submit):not(.offerwall-btn)')).filter(isVisible);
        const yesBtn = allButtons.find((b) => /^(yes|có|true|agree)$/i.test((b.innerText || b.textContent || '').trim()));
        const noBtn = allButtons.find((b) => /^(no|không|false|disagree)$/i.test((b.innerText || b.textContent || '').trim()));
        if (yesBtn && noBtn) {
          const isYesActive = yesBtn.classList.contains('active') || yesBtn.classList.contains('selected') || yesBtn.getAttribute('data-ux-clicked') === '1';
          const isNoActive = noBtn.classList.contains('active') || noBtn.classList.contains('selected') || noBtn.getAttribute('data-ux-clicked') === '1';
          if (!isYesActive && !isNoActive) {
            const uidYes = `choice_yes_${Date.now()}`;
            const uidNo = `choice_no_${Date.now()}`;
            yesBtn.setAttribute('data-ux-choice-id', uidYes);
            noBtn.setAttribute('data-ux-choice-id', uidNo);
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

      // Fallback KHÔNG-FORM: cụm đáp án lân cận theo DOM proximity.
      // Form offer không bao giờ cố định — khi không có container chuẩn nào khớp,
      // gom các nút/link/text có hành vi đáp án (text ngắn, lân cận nhau, không phải
      // noise/nav/submit) theo tổ tiên chung chứa >= 2 phần tử. Không yêu cầu form,
      // không yêu cầu class nhất định.
      if (!results.length) {
        const proximityNoise = /privacy|terms|policy|\bcookie|copyright|disclaimer|sign\s*in|log\s*in|\blogin\b|\bregister\b|unsubscribe|contact\s*us|about\s*us|\bhelp\b|\bfaq|\bmenu\b|\bcart\b|portal|my\s*account|do\s*not\s*sell|opt[- ]?out/i;
        const forwardNavText = /^(?:next|continue|submit|finish|proceed|back|previous|prev|cancel|skip|done|ok|quay\s*lại|bỏ\s*qua|hủy|tiếp)/i;
        const isInteractive = (el) => /^(a|button|input|label|li|div|span)$/i.test(el.tagName || '') ?
          (el.tagName === 'A' || el.tagName === 'BUTTON' || el.tabIndex >= 0 || typeof el.onclick === 'function' ||
            (el.getAttribute && (el.getAttribute('role') === 'button' || el.getAttribute('role') === 'radio' || el.getAttribute('role') === 'option')) ||
            ['input', 'button', 'anchor', 'item', 'option', 'choice', 'answer', 'btn', 'radio'].some((k) => String(el.className || '').toLowerCase().includes(k))) : false;
        const proximityCandidates = Array.from(document.querySelectorAll(
          'button:not([type="submit"]), a[href], [role="radio"], [role="option"], [role="button"], [data-ux-choice-id]'
        )).filter((el) => {
          if (!isVisible(el)) return false;
          const text = (el.innerText || el.textContent || el.value || '').trim();
          if (!text || text.length > 60) return false;
          if (forwardNavText.test(text) || proximityNoise.test(text)) return false;
          const href = (el.getAttribute ? el.getAttribute('href') : '') || '';
          if (href && (href.startsWith('mailto:') || href.startsWith('tel:'))) return false;
          if (!isInteractive(el)) return false;
          // Bỏ qua nút nằm trong input-field form điền (tránh nhầm nút "Check" của ô nhập)
          const holder = el.closest('form, fieldset, .form-group, .form-row, [data-tf-element-role="offer"], .offerwall-card');
          if (holder && holder.querySelector('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea')) return false;
          return true;
        });

        // Gom theo tổ tiên chung gần nhất chứa >= 2 candidate (không cần form)
        const proximityClusters = [];
        const seenClusterRoots = new Set();
        for (const el of proximityCandidates) {
          let clusterRoot = null;
          let ancestor = el.parentElement;
          while (ancestor && ancestor !== document.body) {
            const inside = proximityCandidates.filter((other) => ancestor.contains(other));
            if (inside.length >= 2) { clusterRoot = ancestor; }
            ancestor = ancestor.parentElement;
          }
          if (!clusterRoot || seenClusterRoots.has(clusterRoot)) continue;
          seenClusterRoots.add(clusterRoot);
          // Đánh dấu handled nếu cụm này đã có nút được click trước đó
          const alreadyActive = proximityCandidates.filter((c) => clusterRoot.contains(c)).some((c) =>
            c.classList.contains('active') || c.classList.contains('selected') ||
            c.getAttribute('aria-checked') === 'true' || c.getAttribute('data-ux-clicked') === '1');
          if (alreadyActive) continue;
          // Bỏ qua cụm chứa input điền tự do (trường hợp form thiếu class nhưng có ô nhập)
          if (clusterRoot.querySelector('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]), textarea, select')) continue;
          const headingEl = clusterRoot.querySelector('h1, h2, h3, h4, legend, .question-title, .main-question, p');
          const questionTitle = ((headingEl?.innerText || headingEl?.textContent || '') || 'proximity_options').trim();
          const items = [];
          proximityCandidates.filter((c) => clusterRoot.contains(c)).forEach((btn, optIndex) => {
            const uid = `choice_prox_${optIndex}_${Date.now()}`;
            btn.setAttribute('data-ux-choice-id', uid);
            items.push({
              uid,
              id: btn.id || '',
              text: (btn.innerText || btn.textContent || btn.value || '').trim(),
              value: btn.getAttribute('data-value') || btn.getAttribute('value') || '',
              field: '',
              tagName: btn.tagName.toLowerCase(),
              href: btn.getAttribute('href') || '',
            });
          });
          if (items.length >= 2 && items.length <= 12) {
            proximityClusters.push({ questionTitle, items });
          }
          if (proximityClusters.length >= 4) break;
        }
        results.push(...proximityClusters);
      }

      // Fallback: Tìm các nhóm radio buttons HTML (<input type="radio">) chưa có lựa chọn nào được chọn
      const radioGroups = {};
      const allRadios = Array.from(document.querySelectorAll('input[type="radio"]')).filter((r) => {
        if (r.disabled) return false;
        const style = window.getComputedStyle ? window.getComputedStyle(r) : null;
        if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) {
          const parent = r.closest('label, div, li');
          if (!parent) return false;
          const pStyle = window.getComputedStyle(parent);
          if (pStyle.display === 'none' || pStyle.visibility === 'hidden') return false;
          return Boolean(parent.offsetWidth || parent.offsetHeight || parent.getClientRects().length);
        }
        return Boolean(r.offsetWidth || r.offsetHeight || r.getClientRects().length);
      });

      allRadios.forEach((r) => {
        const name = r.name || r.id || 'unnamed_radio_group';
        if (!radioGroups[name]) radioGroups[name] = [];
        radioGroups[name].push(r);
      });

      for (const [groupName, radios] of Object.entries(radioGroups)) {
        const hasChecked = radios.some((r) => r.checked || r.getAttribute('data-ux-clicked') === '1');
        if (hasChecked || radios.length < 2) continue;

        const container = radios[0].closest('fieldset, .form-group, .step-container, .survey-question, form, div');
        const titleEl = container?.querySelector('legend, h1, h2, h3, h4, label, p, .question-title');
        const questionTitle = (titleEl?.innerText || titleEl?.textContent || groupName).trim();

        const items = radios.map((r, optIndex) => {
          const uid = `choice_radio_${groupName}_${optIndex}_${Date.now()}`;
          r.setAttribute('data-ux-choice-id', uid);
          const lbl = document.querySelector(`label[for="${r.id}"]`) || r.closest('label');
          const text = (lbl?.innerText || lbl?.textContent || r.value || '').trim();
          return {
            uid,
            id: r.id || '',
            text,
            value: r.value || '',
            field: groupName,
            tagName: 'input',
            isRadio: true,
          };
        });

        results.push({
          questionTitle,
          items,
        });
      }

      return results;
    }).catch(() => []);

    for (const group of questionChoiceGroups) {
      if (!group.items || !group.items.length) continue;

      let picked = null;
      const titleLower = (group.questionTitle || '').toLowerCase();

      // A. Nếu là câu hỏi tuổi: ưu tiên khớp tuổi từ record nếu có
      // Heuristic theo items CHỈ chấp nhận khi TẤT CẢ các lựa chọn đều trông như
      // khoảng tuổi thật (8-130). Trước đây regex chấm chọn "1-3", "$50,000-$60,000"
      // làm câu hỏi tuổi → câu income/hours chọn theo tuổi không liên quan.
      const looksAgeRange = (text) => {
        const rangeMatch = String(text || '').match(/(\d+)\s*[-–]\s*(\d+)/);
        if (rangeMatch) {
          const low = Number(rangeMatch[1]);
          const high = Number(rangeMatch[2]);
          return low >= 8 && low < 100 && high > low && high <= 130;
        }
        const plusMatch = String(text || '').match(/^(?:over\s+)?(\d+)\s*\+?$/i);
        if (plusMatch) {
          const value = Number(plusMatch[1]);
          return value >= 8 && value <= 130;
        }
        return false;
      };
      const isAgeQuestion = /age|tuổi|how old|năm sinh|year of birth/i.test(titleLower) ||
        (group.items.length >= 2 && group.items.every((it) => looksAgeRange(it.text)));
      if (isAgeQuestion) {
        const userAge = calculateAge(record);
        if (typeof userAge === 'number') {
          picked = group.items.find((it) => matchAgeRange(it.text, userAge));
        }
      }

      // B. Nếu là câu hỏi Nhà ở (Rent vs Own / Living situation): ưu tiên đối chiếu record nếu có
      if (!picked && (/own or rent|homeowner|housing|living situation|nhà ở/i.test(titleLower) || group.items.some((it) => /rent|own/i.test(it.value)))) {
        const homeVal = String(record?.homeowner || record?.housing || record?.living || '').toLowerCase();
        if (homeVal.includes('own')) {
          picked = group.items.find((it) => /own/i.test(`${it.value} ${it.text}`));
        } else if (homeVal.includes('rent')) {
          picked = group.items.find((it) => /rent/i.test(`${it.value} ${it.text}`));
        }
        if (!picked) {
          picked = group.items.find((it) => /homeowner|own/i.test(`${it.value} ${it.text}`)) ||
                   group.items.find((it) => /renter|rent/i.test(`${it.value} ${it.text}`)) ||
                   group.items[0];
        }
      }

      // C. Nếu là câu hỏi CAPTCHA động vật (huấn luyện từ log thực tế)
      if (!picked && (/animal.*big|big.*animal|largest/i.test(titleLower))) {
        picked = group.items.find((it) => /elephant|whale|bear|lion|dog|horse/i.test(`${it.value} ${it.text}`));
      } else if (!picked && (/animal.*small|small.*animal|smallest/i.test(titleLower))) {
        picked = group.items.find((it) => /ant|mouse|bird|cat|bee/i.test(`${it.value} ${it.text}`));
      }

      // D. Nếu là câu hỏi khảo sát phổ biến trong log: nợ thẻ, nợ thuế, hoàn thuế, ngân hàng, vay vốn, quân đội, duyệt web, thu nhập, con cái
      if (!picked && (/tax debt/i.test(titleLower))) {
        picked = group.items.find((it) => /no|không/i.test(it.text)) || group.items[0];
      } else if (!picked && (/tax refund/i.test(titleLower))) {
        picked = group.items.find((it) => /^(yes|có)$/i.test(it.text)) || group.items[0];
      } else if (!picked && (/bank account|ngân hàng/i.test(titleLower))) {
        picked = group.items.find((it) => /^(yes|có)$/i.test(it.text)) || group.items[0];
      } else if (!picked && (/personal loan|loan\b|khoản vay/i.test(titleLower))) {
        picked = group.items.find((it) => /^(yes|có|maybe)$/i.test(it.text)) || group.items[0];
      } else if (!picked && (/veteran|active duty|military|quân đội/i.test(titleLower))) {
        picked = group.items.find((it) => /^(no|không)$/i.test(it.text)) || group.items.find((it) => /^(yes|có)$/i.test(it.text)) || group.items[0];
      } else if (!picked && (/debt|credit card/i.test(titleLower))) {
        picked = group.items.find((it) => /10,000|20,000|5,000/i.test(it.text)) || group.items[0];
      } else if (!picked && (/browse|online.*day|hours/i.test(titleLower))) {
        picked = group.items.find((it) => /1-3 hours|4-6 hours|less than/i.test(it.text)) || group.items[0];
      } else if (!picked && (/income|salary|earn|thu nhập/i.test(titleLower))) {
        picked = group.items.find((it) => /50,000|75,000|40,000|30,000/i.test(it.text)) || group.items[0];
      } else if (!picked && (/children|kids|child|con cái/i.test(titleLower))) {
        picked = group.items.find((it) => /no kids|không có/i.test(it.text)) || group.items[0];
      } else if (!picked && group.items.some((it) => /^(yes|có)$/i.test(it.text))) {
        picked = group.items.find((it) => /^(yes|có)$/i.test(it.text));
      }

      // E. Nếu không khớp tiêu chí riêng: chọn lựa chọn ĐẦU TIÊN (nhanh, không cần đúng),
      // bỏ qua nút none/cancel/back nếu có lựa chọn khác.
      if (!picked) {
        const pool = group.items.filter((it) => !/none of the above|cancel|back|previous|bỏ qua/i.test(it.text));
        picked = (pool.length > 0 ? pool : group.items)[0];
      }

      if (picked?.uid) {
        try {
          const locator = frame.locator(`[data-ux-choice-id="${picked.uid}"]`).first();
          if (locator && (await locator.count() > 0)) {
            const answerSignature = buildSurveyAnswerSignature(frame, group.questionTitle, group.items);
            // Chỉ KIỂM TRA (không ghi nhận trước) — signature mới được ghi nhận
            // sau khi click thành công để click hỏng vẫn được thử lại vòng sau.
            if (isSurveyAnswerHandled(frame, answerSignature)) continue;
            if (typeof locator.scrollIntoViewIfNeeded === 'function') {
              await locator.scrollIntoViewIfNeeded({ timeout: 600 }).catch(() => {});
            }
            if (typeof locator.hover === 'function') {
              await locator.hover({ timeout: 600 }).catch(() => {});
            }
            const surveyPause = Math.floor(Math.random() * 200) + 200;
            await new Promise((r) => setTimeout(r, surveyPause));
            let clickSucceeded = false;
            let domClickFallbackUsed = false;
            if (picked.isRadio) {
              try {
                await locator.check({ timeout: 1500, force: true });
                clickSucceeded = true;
              } catch {
                try {
                  await locator.click({ timeout: 1000, force: true });
                  clickSucceeded = true;
                } catch {
                  try {
                    await locator.evaluate((el) => {
                      el.checked = true;
                      el.dispatchEvent(new Event('input', { bubbles: true }));
                      el.dispatchEvent(new Event('change', { bubbles: true }));
                    });
                    domClickFallbackUsed = true;
                    clickSucceeded = true;
                  } catch {}
                }
              }
            } else {
              try {
                await locator.click({ timeout: 1500, force: true });
                clickSucceeded = true;
              } catch {
                try {
                  await locator.evaluate((el) => {
                    el.click();
                  });
                  domClickFallbackUsed = true;
                  clickSucceeded = true;
                } catch {}
              }
            }

            if (clickSucceeded) {
              await locator.evaluate((el, shouldNavigate) => {
                el.setAttribute('data-ux-clicked', '1');
                if (el.type === 'radio') el.checked = true;
                el.classList.add('selected', 'active');
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                // Chỉ ép nhảy trang bằng href khi click vật lý không thực hiện được
                // (DOM fallback). Click thật đã điều hướng sẵn — ép lại sẽ điều hướng 2 lần.
                if (shouldNavigate && el.tagName.toLowerCase() === 'a' && el.href && !el.href.startsWith('javascript:')) {
                  try { window.location.href = el.href; } catch {}
                }
              }, domClickFallbackUsed).catch(() => {});
            }

            answeredCount += 1;
            if (session) {
              session.lastActionTime = Date.now();
              addActionCount(session, 1);
              // Click đáp án KHÔNG phải submit — nếu trang thật sự chuyển màn,
              // bộ đếm completedScreens sẽ đếm qua bộ cờ answerClickPending.
              session.answerClickPending = true;
            }
            markSurveyAnswerHandled(frame, answerSignature);
          }
        } catch {}
      }
    }

    // Nếu có câu hỏi vừa được trả lời và trang có nút submit câu hỏi (như Alpha Intent multi-select), tự động bấm tiếp tục
    if (answeredCount > 0) {
      try {
        const qSubmit = frame.locator('button.ai-submit-button--question, button.ai-submit-button--multiselect, button#submit-button.ai-button--question').first();
        if ((await qSubmit.count().catch(() => 0)) > 0 && (await qSubmit.isVisible().catch(() => false))) {
          const isEnabled = await qSubmit.isEnabled().catch(() => true);
          if (isEnabled) {
            await qSubmit.click({ force: true, timeout: 1500 }).catch(async () => {
              await qSubmit.evaluate((b) => b.click()).catch(() => {});
            });
          }
        }
      } catch {}
    }
  } catch {}

  return answeredCount;
}

/**
 * Đếm số tab phụ đang sống trong context của một page (chỉ định cho điều phối offer con song song).
 *
 * @param {object} page Page Playwright hiện tại.
 * @return {number} Số tab đang mở khác page hiện tại.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-21
 */
function countLiveSiblingPages(page) {
  try {
    if (!page?.context) return 0;
    return page.context().pages().filter((p) => !p.isClosed() && p !== page).length;
  } catch {
    return 0;
  }
}

/**
 * Phát hiện và tự động mở tất cả các view/thẻ trên trang Offerwall cuối cùng.
 * Mỗi offer được bấm/nhảy sang trang riêng; các tab offer con được điền song song
 * bởi vòng quét riêng của từng tab (context.on('page', watchPage)).
 * Có trần số tab mở đồng thời (maxConcurrentSubOffers, mặc định 8): khi hết trần,
 * dừng mở thêm ở vòng quét này — thẻ chưa mở sẽ được thử lại vòng sau khi có tab hoàn tất.
 *
 * @param {object} frame Frame Playwright đang quét.
 * @param {object} [page=null] Page Playwright hiện tại để điều hướng trang gốc khi thẻ chỉ có link.
 * @param {object} [options={}] Tùy chọn: maxConcurrentSubOffers (trần tab offer con đồng thời).
 * @return {Promise<number>} Số lượng thẻ offerwall đã được kích hoạt mở.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
export async function handleOfferwallCards(frame, page = null, options = {}) {
  let openedCount = 0;
  const maxConcurrentSubOffers = Number(options.maxConcurrentSubOffers) || 8;
  try {
    // Trần tab đồng thời được check lại trước MỖI thẻ — đủ trần thì dừng, giữ thẻ
    // chưa đánh dấu data-ux-opened để vòng quét sau (khi có tab hoàn tất nhả slot) mở tiếp.
    const cardsToOpen = await frame.evaluate(() => {
      const allCards = Array.from(document.querySelectorAll(
        '.offerwall-card-wrap, .offerwall-card, form[data-tf-element-role="offer"], .campaign-card, ' +
        '.multi-offer .ai-content--offer[id^="offer-"], [id^="offers_list-"], .ai-content--offer[id^="offer-"], ' +
        '.offer-container-v2, [id^="offerwall_card_"], .mock-secondary-offer-card, ' +
        '.offer-item, .reward-card, .offer-tile, [data-offer-id], [data-campaign-id], ' +
        '.tile-offer, .offers-list .card, .ai-content--offer-wall .card, .offerwall .card, ' +
        '.offerwall-list .offer, [class*="offer"][class*="card"]'
      ));
      // Chỉ lấy thẻ cấp cao nhất: loại bỏ thẻ lồng trong thẻ khác đã khớp
      // để tránh bấm cùng một offer nhiều lần (click liên tục vào 1 link).
      const topLevel = allCards.filter((card) =>
        !allCards.some((other) => other !== card && other.contains(card))
      );
      const unhandled = [];
      topLevel.forEach((card, idx) => {
        if (card.getAttribute('data-ux-opened') === '1') return;
        const form = card.closest('form') || (card.tagName.toLowerCase() === 'form' ? card : null);
        if (form && form.getAttribute('data-ux-opened') === '1') return;

        // Bỏ qua thẻ SOI yes/no của alpha-intent: được handleAlphaIntentSoiCards xử lý
        // theo tỉ lệ Yes/No riêng (bấm .first() ở đây sẽ luôn trúng Yes, sai tỉ lệ).
        const soiCard = card.getAttribute?.('data-object-creative-type') === 'soiyesno'
          || card.querySelector?.('[data-object-creative-type="soiyesno"]');
        if (soiCard) { card.setAttribute('data-ux-opened', '1'); return; }

        const uid = `offerwall_card_${idx}_${Date.now()}`;
        card.setAttribute('data-ux-card-id', uid);
        if (form) form.setAttribute('data-ux-card-id', uid);

        // KHÔNG đánh dấu data-ux-opened ở đây: nếu mở thất bại (nút không bấm được,
        // tab không mở), thẻ sẽ được thử lại ở vòng quét sau thay vì bị bỏ qua vĩnh viễn.
        const btn = card.querySelector(
          '.offerwall-btn, button[type="submit"], button#btnSubmit, a.offerwall-btn, [data-tf-element-role="offer-btn"], ' +
          'a[id^="ct-creative-submit-"], button[id^="ct-creative-submit-"], .ct-creative-submit, .ai-submit-button, ' +
          'button.question-answer-button, button[id^="answer-"], .eligibility-btn, [data-mock-secondary-offer-action]'
        );
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
        if (!card.hasBtn && (!card.destUrl || !card.destUrl.startsWith('http'))) {
          await frame.evaluate((uid) => {
            const el = document.querySelector(`[data-ux-card-id="${uid}"]`);
            if (el) el.setAttribute('data-ux-opened', '1');
          }, card.uid).catch(() => {});
          continue;
        }

        // Chuẩn giữ mỗi thẻ: đủ trần tab đồng thời thì dừng mở thêm (chưa đánh dấu gì,
        // thẻ này sẽ được mở ở vòng quét sau).
        if (countLiveSiblingPages(page) >= maxConcurrentSubOffers) break;
        const cardLoc = frame.locator(`[data-ux-card-id="${card.uid}"]`).first();
        if (await cardLoc.count() <= 0) continue;

        let opened = false;
        const btn = cardLoc.locator(
          '.offerwall-btn, button[type="submit"], button#btnSubmit, a.offerwall-btn, [data-tf-element-role="offer-btn"], ' +
          'a[id^="ct-creative-submit-"], button[id^="ct-creative-submit-"], .ct-creative-submit, .ai-submit-button, ' +
          'button.question-answer-button, button[id^="answer-"], .eligibility-btn, [data-mock-secondary-offer-action], ' +
          '.offer-button, .btn-offer, .claim-button, a[class*="offer"], button[class*="offer"]'
        ).first();
        if ((await btn.count() > 0) && (await btn.isVisible().catch(() => false))) {
          await btn.click({ timeout: 2000, force: true }).catch(async () => {
            await btn.evaluate((b) => {
              b.click();
              const form = b.closest('form');
              if (form) form.submit();
            }).catch(() => {});
          });
          opened = true;
        } else if (card.destUrl && card.destUrl.startsWith('http') && page) {
          // Điều hướng trong trang gốc thay vì mở tab mới (hành vi người thật:
          // bấm link là trang chính nhảy đi). Nếu trang gốc đóng thì bỏ qua thẻ.
          try {
            if (typeof page.goto === 'function' && !(typeof page.isClosed === 'function' && page.isClosed())) {
              await page.goto(card.destUrl, { timeout: 15000, waitUntil: 'domcontentloaded' }).catch(() => {});
              opened = true;
            }
          } catch {}
        }

        if (opened) {
          // Đánh dấu đã mở SAU khi mở thành công để tránh retry mở lại offer đã mở.
          // Dùng frame.evaluate với uid thay vì cardLoc.evaluate để không phụ thuộc
          // việc mock locator có evaluate hay không (test selfcheck).
          await frame.evaluate((uid) => {
            const el = document.querySelector(`[data-ux-card-id="${uid}"]`);
            if (!el) return;
            el.setAttribute('data-ux-opened', '1');
            const form = el.closest('form') || (el.tagName.toLowerCase() === 'form' ? el : null);
            if (form) form.setAttribute('data-ux-opened', '1');
          }, card.uid).catch(() => {});
          openedCount += 1;
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } catch {}
    }
  } catch {}
  return openedCount;
}

/**
 * Phát hiện và tự động bấm nút bỏ qua / negative button trên các màn ưu đãi offerwall trung gian
 * để tiếp tục chuyển sang câu hỏi hoặc màn tiếp theo trong phễu (được huấn luyện từ log thực tế).
 *
 * @param {object} frame Frame Playwright đang quét.
 * @return {Promise<number>} Số lượng nút đã bấm.
 */
export async function handleNegativeSkipButtons(frame) {
  let skipped = 0;
  try {
    const skipSelector = [
      'button[data-element-type="negative_button"]',
      'button.creative-button-negative',
      'button.skip-btn',
      'a.skip-btn',
      'button.skip-button',
      'button.ai-skip',
      'a.ai-skip',
      'button.skip-button-text',
      '[data-action="skip"]',
      'button:has-text("No, I don\'t need extra money")',
      'button:has-text("I don\'t want my gift")',
      'button:has-text("No, Skip")',
      'button:has-text("None/Skip")',
      'button:has-text("No Thanks")',
      'a:has-text("No Thanks")',
      'button:has-text("Skip")',
    ].join(', ');

    const buttons = await frame.locator(skipSelector).all();
    for (const btn of buttons) {
      if (!(await btn.isVisible().catch(() => false))) continue;
      const alreadyClicked = await btn.getAttribute('data-ux-clicked').catch(() => null);
      if (alreadyClicked === '1') continue;

      await btn.click({ timeout: 1500, force: true }).catch(async () => {
        await btn.evaluate((b) => b.click()).catch(() => {});
      });
      await btn.evaluate((b) => {
        b.setAttribute('data-ux-clicked', '1');
      }).catch(() => {});
      skipped += 1;
      await new Promise((r) => setTimeout(r, 400));
      break; // Chỉ bấm 1 nút skip mỗi lần quét
    }
  } catch {}
  return skipped;
}

/**
 * Bảng ánh xạ các phím kế cận trên bàn phím QWERTY chuẩn để giả lập gõ nhầm (typo) tự nhiên.
 */
export const ADJACENT_KEYS = {
  a: ['s', 'q', 'z', 'w'], b: ['v', 'g', 'h', 'n'], c: ['x', 'd', 'f', 'v'],
  d: ['s', 'e', 'r', 'f', 'x', 'c'], e: ['w', 's', 'd', 'r'], f: ['d', 'r', 't', 'g', 'v', 'c'],
  g: ['f', 't', 'y', 'h', 'b', 'v'], h: ['g', 'y', 'u', 'j', 'n', 'b'], i: ['u', 'j', 'k', 'o'],
  j: ['h', 'u', 'i', 'k', 'm', 'n'], k: ['j', 'i', 'o', 'l', 'm'], l: ['k', 'o', 'p'],
  m: ['n', 'j', 'k'], n: ['b', 'h', 'j', 'm'], o: ['i', 'k', 'l', 'p'],
  p: ['o', 'l'], q: ['w', 'a'], r: ['e', 'd', 'f', 't'],
  s: ['a', 'w', 'e', 'd', 'x', 'z'], t: ['r', 'f', 'g', 'y'], u: ['y', 'h', 'j', 'i'],
  v: ['c', 'f', 'g', 'b'], w: ['q', 'a', 's', 'e'], x: ['z', 's', 'd', 'c'],
  y: ['t', 'g', 'h', 'u'], z: ['a', 's', 'x'],
  1: ['2', 'q'], 2: ['1', '3', 'w', 'q'], 3: ['2', '4', 'e', 'w'], 4: ['3', '5', 'r', 'e'],
  5: ['4', '6', 't', 'r'], 6: ['5', '7', 'y', 't'], 7: ['6', '8', 'u', 'y'], 8: ['7', '9', 'i', 'u'],
  9: ['8', '0', 'o', 'i'], 0: ['9', '-', 'p', 'o'],
};

/**
 * Di chuyển chuột theo đường cong Bézier bậc 3 mô phỏng chuyển động tay người:
 * - Gia tốc ban đầu (ease-in), lướt nhanh ở giữa và giảm tốc khi tới gần đích (ease-out).
 * - Control points có độ lệch ngẫu nhiên và vi rung lắc (micro-jitter).
 * - Sinh sự kiện OS/CDP thông qua Playwright page.mouse.move (isTrusted: true).
 *
 * @param {object} page Page của Playwright.
 * @param {number} targetX Toạ độ X đích.
 * @param {number} targetY Toạ độ Y đích.
 * @return {Promise<void>}
 */
export async function humanMouseMove(page, targetX, targetY) {
  if (!page?.mouse || typeof page.mouse.move !== 'function') return;

  if (!page._lastMousePos) {
    page._lastMousePos = {
      x: Math.floor(Math.random() * 200) + 100,
      y: Math.floor(Math.random() * 150) + 100,
    };
  }

  const startX = page._lastMousePos.x;
  const startY = page._lastMousePos.y;
  const distance = Math.hypot(targetX - startX, targetY - startY);

  if (distance < 3) {
    await page.mouse.move(targetX, targetY).catch(() => {});
    page._lastMousePos = { x: targetX, y: targetY };
    return;
  }

  const steps = Math.min(22, Math.max(7, Math.round(distance / 28)));
  const dx = targetX - startX;
  const dy = targetY - startY;
  const normalX = -dy / distance;
  const normalY = dx / distance;
  const curvature = (Math.random() - 0.5) * Math.min(distance * 0.35, 70);

  const cp1X = startX + dx * 0.25 + normalX * curvature + (Math.random() - 0.5) * 12;
  const cp1Y = startY + dy * 0.25 + normalY * curvature + (Math.random() - 0.5) * 12;
  const cp2X = startX + dx * 0.75 + normalX * curvature * 0.5 + (Math.random() - 0.5) * 12;
  const cp2Y = startY + dy * 0.75 + normalY * curvature * 0.5 + (Math.random() - 0.5) * 12;

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const easedT = t * t * (3 - 2 * t);
    const u = 1 - easedT;

    const x = u * u * u * startX + 3 * u * u * easedT * cp1X + 3 * u * easedT * easedT * cp2X + easedT * easedT * easedT * targetX;
    const y = u * u * u * startY + 3 * u * u * easedT * cp1Y + 3 * u * easedT * easedT * cp2Y + easedT * easedT * easedT * targetY;

    const jitter = (i < steps) ? (Math.random() - 0.5) * 1.5 : 0;
    await page.mouse.move(Math.round(x + jitter), Math.round(y + jitter)).catch(() => {});
  }

  await page.mouse.move(targetX, targetY).catch(() => {});
  page._lastMousePos = { x: targetX, y: targetY };
}

/**
 * Cuộn chuột tự nhiên (Mouse Wheel Physics):
 * - Chia cuộn thành các đợt lăn bánh xe giảm tốc (decelerating bursts).
 *
 * @param {object} page Page của Playwright.
 * @param {number} deltaY Quãng đường cuộn theo trục Y.
 * @return {Promise<void>}
 */
export async function humanWheelScroll(page, deltaY = 200) {
  if (!page?.mouse || typeof page.mouse.wheel !== 'function') return;
  const bursts = Math.max(3, Math.min(5, Math.round(Math.abs(deltaY) / 60)));
  let remaining = deltaY;
  for (let b = 0; b < bursts; b++) {
    const factor = (bursts - b) / bursts;
    const chunk = Math.round((remaining * factor) / 2) || (remaining > 0 ? 10 : -10);
    remaining -= chunk;
    await page.mouse.wheel(0, chunk).catch(() => {});
    await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 20) + 30));
  }
}

/**
 * Click tự nhiên với chuột vật lý Playwright (isTrusted: true qua CDP):
 * - Tìm toạ độ bounding box thật của phần tử.
 * - Di chuyển chuột mượt theo đường cong Bézier (humanMouseMove) tới điểm ngẫu nhiên bên trong phần tử.
 * - Nghỉ ngắn tiền phản xạ (pre-dwell: 30ms - 70ms).
 * - Nhấn chuột xuống (mouse.down).
 * - Giữ chuột (hold click: 55ms - 105ms) mô phỏng lực ấn nút của ngón tay người.
 * - Thả chuột (mouse.up).
 * - Fallback an toàn nếu phần tử ẩn, boundingBox rỗng hoặc môi trường unit test.
 *
 * @param {object} page Page của Playwright.
 * @param {object} target Locator hoặc ElementHandle cần click.
 * @return {Promise<boolean>}
 */
export async function humanClick(page, target) {
  if (!target) return false;

  const activePage = page || (typeof target?.page === 'function' ? target.page() : null);

  try {
    if (typeof target.scrollIntoViewIfNeeded === 'function') {
      await target.scrollIntoViewIfNeeded({ timeout: 500 }).catch(() => {});
    }

    if (activePage?.mouse && typeof target.boundingBox === 'function') {
      const box = await target.boundingBox().catch(() => null);
      if (box && box.width > 0 && box.height > 0) {
        const clickX = box.x + box.width * (0.2 + 0.6 * Math.random());
        const clickY = box.y + box.height * (0.2 + 0.6 * Math.random());

        await humanMouseMove(activePage, clickX, clickY);

        const preDwell = Math.floor(Math.random() * 40) + 30;
        await new Promise((r) => setTimeout(r, preDwell));

        await activePage.mouse.down().catch(() => {});

        const holdDuration = Math.floor(Math.random() * 50) + 55;
        await new Promise((r) => setTimeout(r, holdDuration));

        await activePage.mouse.up().catch(() => {});

        if (typeof target.focus === 'function') {
          await target.focus().catch(() => {});
        }
        return true;
      }
    }
  } catch {}

  // Fallback Playwright click hoặc DOM click
  try {
    if (typeof target.click === 'function') {
      await target.click({ force: true, timeout: 2000 }).catch(() => {});
      return true;
    }
  } catch {}

  try {
    if (typeof target.evaluate === 'function') {
      await target.evaluate((el) => el.click()).catch(() => {});
      return true;
    }
  } catch {}

  return false;
}

/**
 * Vi chuyển động chuột tự nhiên khi nhàn rỗi (Natural Mouse Idle Drift):
 * - Mô phỏng độ rung tay hoặc di chuyển vu vơ khi người dùng đọc câu hỏi hoặc chờ trang tải.
 * - Quãng đường ngắn 12px - 35px, không giật lag.
 *
 * @param {object} page Page của Playwright.
 * @param {number} [count=1] Số lần trôi chuột.
 * @return {Promise<void>}
 */
export async function naturalMouseDrift(page, count = 1) {
  if (!page?.mouse || typeof page.mouse.move !== 'function') return;

  if (!page._lastMousePos) {
    page._lastMousePos = {
      x: Math.floor(Math.random() * 200) + 150,
      y: Math.floor(Math.random() * 150) + 150,
    };
  }

  for (let c = 0; c < count; c++) {
    const angle = Math.random() * 2 * Math.PI;
    const distance = Math.floor(Math.random() * 22) + 12; // 12px - 34px
    const targetX = Math.max(20, Math.min(1200, Math.round(page._lastMousePos.x + Math.cos(angle) * distance)));
    const targetY = Math.max(20, Math.min(800, Math.round(page._lastMousePos.y + Math.sin(angle) * distance)));

    await humanMouseMove(page, targetX, targetY);
    await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 50) + 50));
  }
}

/**
 * Nhập văn bản mô phỏng hành vi gõ phím của người thật (Anti-bot detection avoidance):
 * - Cuộn mượt tới phần tử, click tự nhiên (humanClick) để focus ô nhập liệu.
 * - Nhịp gõ thích ứng (Adaptive Cadence): Tên/Email gõ theo phản xạ cơ bắp nhanh; Số điện thoại/Địa chỉ/Zip gõ cẩn thận có ngắt cụm.
 * - Giả lập gõ nhầm phím kế cận (typo) tự nhiên kèm phản ứng dừng và xóa (Backspace) sửa lại.
 * - Dừng lâu hơn một chút (120ms - 200ms) tại các ký tự đặc biệt (@, ., space, -, /).
 * - Bổ sung cơ chế fallback setter nếu ô có mask hoặc script trang can thiệp.
 *
 * @param {object} field Locator của trường nhập liệu.
 * @param {string|number} text Nội dung cần nhập.
 * @param {object} [page=null] Đối tượng Page của Playwright để dùng waitForTimeout.
 * @param {object} [options={}] Tuỳ chọn điều khiển gõ giả lập.
 * @return {Promise<void>}
 */

/**
 * Wrapper chống gõ đè (re-entry guard): đặt lock data-ux-typing (timestamp) lên ô
 * ngay khi bắt đầu gõ; vòng quét autofill sau sẽ bỏ qua ô đang gõ (lock tươi < 30s).
 * Lock cũ quá hạn được coi là vòng trước đã chết → cho phép gõ lại.
 * Fix lỗi ký tự lặp xen kẽ (wggcc556622mmaann@@...) khi nhịp gõ chậm vượt khoảng quét.
 *
 * @param {object} field Locator ô input cần gõ.
 * @param {string} text Nội dung cần gõ.
 * @param {object} [page=null] Trang Playwright chứa ô (fallback khi field không có page()).
 * @param {object} [options={}] Tùy chọn (simulateTypo, forceTypo, onLog).
 * @return {Promise<void>} Hoàn tất khi đã gõ xong toàn bộ nội dung.
 * @throws {Error} Lỗi gõ được nuốt bên trong humanTypeCore, không ném ra ngoài.
 * @author coder-nguoi-tay
 * @since 2026-10-27
 */
export async function humanType(field, text, page = null, options = {}) {
  let marked = false;
  try {
    await field?.evaluate?.((el) => { el.dataset.uxTyping = String(Date.now()); });
    marked = true;
  } catch {}
  try {
    return await humanTypeCore(field, text, page, options);
  } finally {
    if (marked) {
      try {
        await field?.evaluate?.((el) => { el.removeAttribute('data-ux-typing'); });
      } catch {}
    }
  }
}

async function humanTypeCore(field, text, page = null, options = {}) {
  const str = String(text ?? '');
  if (!str) return;

  const activePage = page || (typeof field?.page === 'function' ? field.page() : null);
  const isRealBrowser = Boolean(activePage?.mouse && typeof activePage.mouse.move === 'function');
  const enableTypo = options.simulateTypo !== undefined ? Boolean(options.simulateTypo) : isRealBrowser;

  try {
    if (typeof field.scrollIntoViewIfNeeded === 'function') {
      await field.scrollIntoViewIfNeeded({ timeout: 600 }).catch(() => {});
    }
    if (activePage?.mouse && typeof field.boundingBox === 'function') {
      await humanClick(activePage, field).catch(() => {});
    } else {
      if (typeof field.hover === 'function') {
        await field.hover({ timeout: 600 }).catch(() => {});
      }
      if (typeof field.click === 'function') {
        await field.click({ force: true, timeout: 1500 }).catch(() => {});
      }
    }
    if (typeof field.focus === 'function') {
      await field.focus().catch(() => {});
    }
  } catch {}

  const prePause = Math.floor(Math.random() * 40) + 25;
  if (activePage && typeof activePage.waitForTimeout === 'function') {
    await activePage.waitForTimeout(prePause).catch(() => {});
  } else {
    await new Promise((r) => setTimeout(r, prePause));
  }

  // Xóa nội dung cũ tự nhiên qua tổ hợp phím (Select All + Backspace) nếu trường đã có chữ
  try {
    const isMac = process.platform === 'darwin';
    const selectAllKey = isMac ? 'Meta+A' : 'Control+A';
    if (activePage?.keyboard) {
      await activePage.keyboard.press(selectAllKey).catch(() => {});
      await activePage.keyboard.press('Backspace').catch(() => {});
    } else if (typeof field.press === 'function') {
      await field.press(selectAllKey).catch(() => {});
      await field.press('Backspace').catch(() => {});
    }
  } catch {}

  // Đảm bảo không còn ký tự cũ sót lại để tránh ghép nối chuỗi không mong muốn
  if (typeof field.evaluate === 'function') {
    await field.evaluate((el) => {
      if (el && el.value) {
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }).catch(() => {});
  }

  // Nhịp gõ thích ứng theo đặc tính nội dung
  const digitsOnly = str.replace(/[\s\(\)\-\.]/g, '');
  const isDigitsOnly = /^\d+$/.test(digitsOnly);
  const isNameOrEmail = !isDigitsOnly && (/@/.test(str) || /^[a-zA-Z\s'-]+$/.test(str));

  // Gõ tuần tự từng ký tự mô phỏng nhịp gõ phím của người thật kèm giả lập gõ nhầm (Typo Simulation)
  let typedOk = false;
  if (activePage?.keyboard && typeof activePage.keyboard.type === 'function') {
    try {
      let typoDone = false;
      for (let i = 0; i < str.length; i++) {
        const char = str[i];
        // Nhịp gõ người thật: 110-190ms/ký tự (trung bình ~7 chars/giây), có biến động tự nhiên
        let charDelay = isNameOrEmail
          ? Math.floor(Math.random() * 80) + 110
          : (isDigitsOnly ? Math.floor(Math.random() * 70) + 130 : Math.floor(Math.random() * 80) + 115);

        if ([' ', '@', '.', '-', '_', '/'].includes(char)) {
          charDelay += Math.floor(Math.random() * 80) + 90; // Nhịp dừng trước dấu đặc biệt: 180-320ms
        } else if (isDigitsOnly && digitsOnly.length >= 10 && (i === 3 || i === 6)) {
          // Ngắt nhịp tự nhiên giữa các cụm số điện thoại (Area code & Prefix)
          charDelay += Math.floor(Math.random() * 120) + 220; // 340-580ms
        }

        // "Lơ đãng" như người thật: ~4% ký tự có khoảng nghỉ suy nghĩ ngắn
        if (Math.random() < 0.04) {
          charDelay += Math.floor(Math.random() * 250) + 200;
        }

        // Typo simulation: chỉ bật khi chạy trên browser thật hoặc cấu hình rõ ràng, xác suất ~1.2%, tối đa 1 typo mỗi trường, không áp dụng sau dấu @
        const lower = char.toLowerCase();
        const adjacent = ADJACENT_KEYS[lower];
        const canTypo = enableTypo && !typoDone && adjacent?.length && i > 1 && i < str.length - 1 && !str.slice(i).includes('@') && (options.forceTypo || Math.random() < 0.012);

        if (canTypo) {
          typoDone = true;
          const wrongChar = adjacent[Math.floor(Math.random() * adjacent.length)];
          const typedWrong = char === char.toUpperCase() ? wrongChar.toUpperCase() : wrongChar;
          await activePage.keyboard.type(typedWrong, { delay: charDelay }).catch(() => {});
          const hesitate = Math.floor(Math.random() * 100) + 110;
          await new Promise((r) => setTimeout(r, hesitate));
          await activePage.keyboard.press('Backspace').catch(() => {});
          const fixPause = Math.floor(Math.random() * 35) + 40;
          await new Promise((r) => setTimeout(r, fixPause));
        }

        await activePage.keyboard.type(char, { delay: charDelay });
      }
      typedOk = true;
    } catch {
      typedOk = false;
    }
  } else if (typeof field.pressSequentially === 'function') {
    try {
      let typoDone = false;
      for (let i = 0; i < str.length; i++) {
        const char = str[i];
        // Nhịp gõ người thật (bản pressSequentially): đồng bộ với nhánh keyboard.type
        let charDelay = isNameOrEmail
          ? Math.floor(Math.random() * 80) + 110
          : (isDigitsOnly ? Math.floor(Math.random() * 70) + 130 : Math.floor(Math.random() * 80) + 115);

        if ([' ', '@', '.', '-', '_', '/'].includes(char)) {
          charDelay += Math.floor(Math.random() * 80) + 90;
        } else if (isDigitsOnly && digitsOnly.length >= 10 && (i === 3 || i === 6)) {
          charDelay += Math.floor(Math.random() * 120) + 220;
        }

        if (Math.random() < 0.04) {
          charDelay += Math.floor(Math.random() * 250) + 200;
        }

        const lower = char.toLowerCase();
        const adjacent = ADJACENT_KEYS[lower];
        const canTypo = enableTypo && !typoDone && adjacent?.length && i > 1 && i < str.length - 1 && !str.slice(i).includes('@') && (options.forceTypo || Math.random() < 0.012);

        if (canTypo) {
          typoDone = true;
          const wrongChar = adjacent[Math.floor(Math.random() * adjacent.length)];
          const typedWrong = char === char.toUpperCase() ? wrongChar.toUpperCase() : wrongChar;
          await field.pressSequentially(typedWrong, { delay: charDelay }).catch(() => {});
          const hesitate = Math.floor(Math.random() * 100) + 110;
          await new Promise((r) => setTimeout(r, hesitate));
          if (typeof field.press === 'function') {
            await field.press('Backspace').catch(() => {});
          }
          const fixPause = Math.floor(Math.random() * 35) + 40;
          await new Promise((r) => setTimeout(r, fixPause));
        }

        await field.pressSequentially(char, { delay: charDelay });
      }
      typedOk = true;
    } catch {
      typedOk = false;
    }
  }

  // Fallback an toàn nếu chưa gõ được qua keyboard/pressSequentially
  if (!typedOk && typeof field.pressSequentially === 'function') {
    try {
      await field.pressSequentially(str, { delay: Math.floor(Math.random() * 60) + 110 });
      typedOk = true;
    } catch {}
  }
  if (!typedOk && typeof field.fill === 'function') {
    try {
      await field.fill(str, { force: true, timeout: 2500 });
      typedOk = true;
    } catch {}
  }

  // Kiểm tra lại giá trị sau khi gõ: nếu rỗng (do mask hoặc validator trang), đặt qua property descriptor
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

  // Đảm bảo kích hoạt đầy đủ input, change, blur để các framework cập nhật validation và enable nút submit
  if (typeof field.evaluate === 'function') {
    await field.evaluate((el) => {
      try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
      try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
      try { el.dispatchEvent(new Event('blur', { bubbles: true })); } catch {}
    }).catch(() => {});
  }
  if (typeof field.blur === 'function') {
    await field.blur().catch(() => {});
  }

  // Dừng siêu ngắn tự nhiên sau khi gõ xong trường (25ms - 50ms)
  const postPause = Math.floor(Math.random() * 25) + 25;
  if (activePage && typeof activePage.waitForTimeout === 'function') {
    await activePage.waitForTimeout(postPause).catch(() => {});
  } else {
    await new Promise((r) => setTimeout(r, postPause));
  }
}

/**
 * Trích xuất dữ liệu người dùng / địa lý đã có sẵn từ các biến JavaScript toàn cục trên trang
 * (ví dụ: window.globalData của SweepstakesAlerts/LaunchPotato, window.pushyUserData,
 * window.jLead và window.AF của Uplevel Rewards, window.dataLayer).
 *
 * @param {object} frame Frame hoặc Page của Playwright.
 * @return {Promise<object>} Dữ liệu trích xuất được (email, city, state, zipcode, phone, firstname, lastname).
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
export async function extractPrepopulatedDataFromPage(frame) {
  if (!frame || typeof frame.evaluate !== 'function') return {};
  try {
    return await frame.evaluate(() => {
      const extracted = {};

      // 1. LaunchPotato / SweepstakesAlerts: window.globalData
      if (typeof window !== 'undefined' && window.globalData) {
        const s = window.globalData.sessionData || {};
        const g = window.globalData.geolocation || {};

        if (s.email && typeof s.email === 'string' && s.email.includes('@')) {
          extracted.email = s.email.trim();
        }
        if (s.city && typeof s.city === 'string' && s.city.trim().length > 1) {
          extracted.city = s.city.trim();
        }
        if (s.zipcode && typeof s.zipcode === 'string' && /^\d{5}/.test(s.zipcode)) {
          extracted.zipcode = s.zipcode.slice(0, 5);
        }
        if (s.state && typeof s.state === 'string' && s.state.trim().length >= 2) {
          extracted.state = s.state.trim().toUpperCase();
        }
        if (s.firstname && typeof s.firstname === 'string' && s.firstname.trim().length > 0) {
          extracted.firstname = s.firstname.trim();
        }
        if (s.lastname && typeof s.lastname === 'string' && s.lastname.trim().length > 0) {
          extracted.lastname = s.lastname.trim();
        }
        if (s.phone && typeof s.phone === 'string' && s.phone.replace(/\D/g, '').length >= 10) {
          extracted.phone = s.phone.replace(/\D/g, '').slice(-10);
        }
        if (s.gender && typeof s.gender === 'string' && s.gender.trim().length > 0) {
          extracted.gender = s.gender.trim();
        }

        // Bổ sung từ geolocation nếu sessionData còn trống
        if (!extracted.state && g.stateAbbreviation && typeof g.stateAbbreviation === 'string') {
          extracted.state = g.stateAbbreviation.trim().toUpperCase();
        }
        if (!extracted.city && g.city && typeof g.city === 'string') {
          extracted.city = g.city.trim();
        }
        if (!extracted.zipcode && g.zipcode && typeof g.zipcode === 'string' && /^\d{5}/.test(g.zipcode)) {
          extracted.zipcode = g.zipcode.slice(0, 5);
        }
      }

      // 2. Pushy Notification Data: window.pushyUserData
      if (typeof window !== 'undefined' && window.pushyUserData && window.pushyUserData.pii) {
        const p = window.pushyUserData.pii;
        if (p.email && typeof p.email === 'string' && p.email.includes('@') && !extracted.email) {
          extracted.email = p.email.trim();
        }
        if (p.city && typeof p.city === 'string' && p.city.trim().length > 1 && !extracted.city) {
          extracted.city = p.city.trim();
        }
        if (p.zip && typeof p.zip === 'string' && /^\d{5}/.test(p.zip) && !extracted.zipcode) {
          extracted.zipcode = p.zip.slice(0, 5);
        }
        if (p.state && typeof p.state === 'string' && p.state.trim().length >= 2 && !extracted.state) {
          extracted.state = p.state.trim().toUpperCase();
        }
        if (p.firstname && typeof p.firstname === 'string' && !extracted.firstname) {
          extracted.firstname = p.firstname.trim();
        }
        if (p.lastname && typeof p.lastname === 'string' && !extracted.lastname) {
          extracted.lastname = p.lastname.trim();
        }
        if (p.phone && typeof p.phone === 'string' && p.phone.replace(/\D/g, '').length >= 10 && !extracted.phone) {
          extracted.phone = p.phone.replace(/\D/g, '').slice(-10);
        }
      }

      // 3. Uplevel Rewards: window.jLead & window.AF.Lead
      if (typeof window !== 'undefined' && window.jLead) {
        const j = window.jLead;
        if (j.email && typeof j.email === 'string' && j.email.includes('@') && !extracted.email) {
          extracted.email = j.email.trim();
        }
        if (j.phone && !extracted.phone) {
          const digits = String(j.phone).replace(/\D/g, '');
          if (digits.length >= 10) extracted.phone = digits.slice(-10);
        }
        if (j.first_name && !extracted.firstname) extracted.firstname = String(j.first_name).trim();
        if (j.last_name && !extracted.lastname) extracted.lastname = String(j.last_name).trim();
        if (j.zip && !extracted.zipcode) {
          const z = String(j.zip).replace(/\D/g, '');
          if (z.length === 5) extracted.zipcode = z;
        }
        if (j.state && !extracted.state) extracted.state = String(j.state).trim().toUpperCase();
        if (j.city && !extracted.city) extracted.city = String(j.city).trim();
      }
      if (typeof window !== 'undefined' && window.AF?.Lead?.v) {
        const v = window.AF.Lead.v;
        if (v.Email && typeof v.Email === 'string' && v.Email.includes('@') && !extracted.email) {
          extracted.email = v.Email.trim();
        }
        if (v.Zip && !extracted.zipcode) {
          const z = String(v.Zip).replace(/\D/g, '');
          if (z.length === 5) extracted.zipcode = z;
        }
        if (v.State && !extracted.state) extracted.state = String(v.State).trim().toUpperCase();
        if (v.City && !extracted.city) extracted.city = String(v.City).trim();
      }

      return extracted;
    });
  } catch {
    return {};
  }
}

/**
 * Điền ô họ tên Alpha Intent bằng dữ liệu record rồi xác minh giá trị còn giữ sau blur.
 *
 * @param {object} frame Frame chứa form Alpha Intent.
 * @param {object} record Bản ghi người dùng, không tạo tên thay thế.
 * @return {Promise<boolean>} True nếu ô họ tên giữ được giá trị hợp lệ.
 * @throws {never} Lỗi locator được xử lý và trả về false.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
export async function fillAlphaIntentFullName(frame, record = {}) {
  const fullName = String(record.fullname || '').trim();
  const combinedName = [record.firstname, record.lastname].filter(Boolean).join(' ').trim();
  const name = fullName.split(/\s+/).length >= 2 ? fullName : combinedName;
  if (name.split(/\s+/).length < 2 || typeof frame.locator !== 'function') return false;
  const field = frame.locator('#alpha-intent-content input[data-testid="fullname-input"], #alpha-intent-content .ai-input-container-fullname input#name, #ai-funnel input[data-testid="fullname-input"], #ai-funnel .ai-input-container-fullname input#name, #ai-funnel input#name, input[data-testid="fullname-input"], .alpha-intent-content input#name');
  if (!(await field.count().catch(() => 0)) || !(await field.isVisible().catch(() => false))) return false;
  try {
    const current = (await field.inputValue()).trim();
    if (current === name && (await field.getAttribute('data-ux-filled').catch(() => null)) === '1') return false;
    if (current !== name) {
      await field.fill(name, { timeout: 2500 });
    }
    await field.press('Tab', { timeout: 1000 });
    const actual = (await field.inputValue()).trim();
    if (actual !== name) return false;
    await field.evaluate((el) => { el.dataset.uxFilled = '1'; });

    // Đồng bộ trường required ẩn #input-fullname (data-hidden-required="true") để validation không fail.
    // Không invent giá trị: chỉ sao chép từ #name đã điền thành công.
    if (typeof frame.evaluate === 'function') {
      await frame.evaluate((val) => {
        const hidden = document.getElementById('input-fullname');
        if (hidden && hidden.readOnly) {
          hidden.value = val;
          hidden.dispatchEvent(new Event('input', { bubbles: true }));
          hidden.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, name).catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Điền và đồng bộ toàn diện các trường đặc thù của Alpha Intent:
 * - Họ tên (đồng bộ #input-fullname data-hidden-required)
 * - Giới tính (radio & đồng bộ #input-gender data-hidden-required)
 * - TCPA / Disclaimer Checkbox (đồng bộ #has_tcpa_optin)
 * - Đồng bộ các trường ẩn required khác (#input-address, #input-dob, #input-phone)
 * - Nút lưu số điện thoại TCPA (button.button-save-phone)
 *
 * @param {object} frame Frame chứa form Alpha Intent.
 * @param {object} record Bản ghi người dùng.
 * @return {Promise<number>} Số trường/hành động đã hoàn thành trong pass này.
 * @throws {never} Lỗi xử lý an toàn không gián đoạn luồng chính.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-24
 */
export async function fillAlphaIntentSpecialFields(frame, record = {}) {
  let filledCount = 0;
  if (!frame || typeof frame.evaluate !== 'function') return filledCount;

  try {
    // 1. Họ tên Alpha Intent qua locator chuẩn
    let nameFilled = await fillAlphaIntentFullName(frame, record);
    if (nameFilled) {
      filledCount += 1;
    } else {
      // 1.1 Mở rộng họ tên cho container #ai-funnel (LaunchPotato / SweepstakesAlerts)
      const fallbackNameField = frame.locator('#ai-funnel input[data-testid="fullname-input"], #ai-funnel .ai-input-container-fullname input#name, #ai-funnel input#name, #ai-funnel input[name="name"], #ai-funnel input[name="fullName"], #ai-funnel input[name="full_name"], #alpha-intent-content input#name, #alpha-intent-content input[name="name"], input[data-testid="fullname-input"], input[data-testid="name-input"], .alpha-intent-content input#name').first();
      if ((await fallbackNameField.count().catch(() => 0)) > 0 && (await fallbackNameField.isVisible().catch(() => false))) {
        const curVal = (await fallbackNameField.inputValue().catch(() => '')).trim();
        const combinedName = [record.firstname, record.lastname].filter(Boolean).join(' ').trim() || record.fullname || (record.email ? record.email.split('@')[0] : 'James Smith');
        if (combinedName && curVal !== combinedName) {
          await fallbackNameField.fill(combinedName).catch(() => {});
          await fallbackNameField.press('Tab').catch(() => {});
          await fallbackNameField.evaluate((el) => { el.dataset.uxFilled = '1'; }).catch(() => {});
          filledCount += 1;
          await frame.evaluate((val) => {
            const hidden = document.getElementById('input-fullname');
            if (hidden && hidden.readOnly) {
              hidden.value = val;
              hidden.dispatchEvent(new Event('input', { bubbles: true }));
              hidden.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }, combinedName).catch(() => {});
        }
      }
    }

    // 2. Giới tính Alpha Intent & đồng bộ #input-gender (data-hidden-required="true")
    const genderVal = /female|f|nữ/i.test(record.gender || '') ? 'FEMALE' : 'MALE';
    const genderLoc = frame.locator(`input[type="radio"].ai-input-gender[value="${genderVal}" i], input#ai-${genderVal.toLowerCase()}-input, .ai-gender-button[data-gender="${genderVal}" i], [data-testid="gender-${genderVal.toLowerCase()}"], #ai-funnel [data-gender="${genderVal}"], #ai-funnel button[data-gender="${genderVal}"]`).first();
    if ((await genderLoc.count().catch(() => 0)) > 0) {
      const isChecked = await genderLoc.isChecked().catch(() => false);
      if (!isChecked) {
        await genderLoc.check({ force: true }).catch(async () => {
          await genderLoc.evaluate((r) => { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }).catch(() => {});
        });
        filledCount += 1;
      }
      await frame.evaluate((val) => {
        const hiddenGender = document.getElementById('input-gender');
        if (hiddenGender && hiddenGender.readOnly && hiddenGender.value !== val) {
          hiddenGender.value = val;
          hiddenGender.dispatchEvent(new Event('input', { bubbles: true }));
          hiddenGender.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, genderVal).catch(() => {});
    }

    // 3. TCPA Disclaimer Checkbox (#ai-disclaimer-container) & đồng bộ #has_tcpa_optin
    const disclaimerCb = frame.locator('#ai-disclaimer-container input[type="checkbox"], label.tcpa-text input[type="checkbox"], .ai-tcpa input[type="checkbox"], [data-testid="tcpa-checkbox"], #ai-funnel input[type="checkbox"][name*="consent"], #ai-funnel input[type="checkbox"][name*="tcpa"]').first();
    if ((await disclaimerCb.count().catch(() => 0)) > 0) {
      const isChecked = await disclaimerCb.isChecked().catch(() => false);
      if (!isChecked) {
        await disclaimerCb.check({ force: true }).catch(async () => {
          await disclaimerCb.evaluate((cb) => {
            cb.checked = true;
            cb.setAttribute('aria-checked', 'true');
            cb.dispatchEvent(new Event('input', { bubbles: true }));
            cb.dispatchEvent(new Event('change', { bubbles: true }));
          }).catch(() => {});
        });
        filledCount += 1;
      }
      await frame.evaluate(() => {
        const hasTcpa = document.getElementById('has_tcpa_optin');
        if (hasTcpa) {
          hasTcpa.value = '1';
          hasTcpa.setAttribute('data-checked', 'true');
        }
      }).catch(() => {});
    }

    // 4.1 Điền và đồng bộ ô Địa chỉ Alpha Intent (#address, input[data-testid="address-input"])
    const addrField = frame.locator('#address, input[data-testid="address-input"], #ai-funnel input#address, #ai-funnel input[name="address"], #alpha-intent-content input#address, input[name="address1"]').first();
    if ((await addrField.count().catch(() => 0)) > 0 && (await addrField.isVisible().catch(() => false))) {
      const curAddr = (await addrField.inputValue().catch(() => '')).trim();
      const targetAddr = record.address || '4125 N Inspiration Loop';
      if (!curAddr || curAddr.length < 3) {
        await addrField.fill(targetAddr).catch(() => {});
        await addrField.press('Tab').catch(() => {});
        await addrField.evaluate((el) => { el.dataset.uxFilled = '1'; }).catch(() => {});
        filledCount += 1;
      }
    }

    // 4.2 Điền và đồng bộ ô Ngày sinh Alpha Intent (#date, input[data-testid="dob-input"])
    const dobField = frame.locator('#date, input[data-testid="dob-input"], #ai-funnel input#date, input[name="date"]').first();
    if ((await dobField.count().catch(() => 0)) > 0 && (await dobField.isVisible().catch(() => false))) {
      const curDob = (await dobField.inputValue().catch(() => '')).trim();
      if (!curDob || curDob.includes('_') || curDob.length < 8) {
        let formattedDob = '05/18/1992';
        if (record.dob && /^\d{4}-\d{2}-\d{2}$/.test(record.dob)) {
          const [y, m, d] = record.dob.split('-');
          formattedDob = `${m}/${d}/${y}`;
        } else if (record.dob && /^\d{2}\/\d{2}\/\d{4}$/.test(record.dob)) {
          formattedDob = record.dob;
        }
        await dobField.fill(formattedDob).catch(() => {});
        await dobField.press('Tab').catch(() => {});
        await dobField.evaluate((el) => { el.dataset.uxFilled = '1'; }).catch(() => {});
        filledCount += 1;
      }
    }

    // 4.3 Điền và đồng bộ ô Số điện thoại Alpha Intent (#phone, input[data-testid="phone-input"])
    const phoneField = frame.locator('#phone, input[data-testid="phone-input"], #ai-funnel input#phone, #ai-funnel input[name="phone"], #alpha-intent-content input#phone, input[name="phoneNumber"], input[type="tel"]:not([name*="zip" i]):not([id*="zip" i]):not([name*="postal" i]):not([id*="postal" i]):not([name="age"]):not([id="age"]):not([id$="-age"])').first();
    // Ô tel của zip/age bị loại: trước đây `.first()` trúng ô Zip đầu tiên và gõ SĐT vào đó.
    if ((await phoneField.count().catch(() => 0)) > 0 && (await phoneField.isVisible().catch(() => false))) {
      const curPhone = (await phoneField.inputValue().catch(() => '')).replace(/\D/g, '');
      if (curPhone.length < 10) {
        const rawPhone = getNormalizedPhone(record);
        const area = rawPhone.slice(0, 3);
        const mid = rawPhone.slice(3, 6);
        const last = rawPhone.slice(6, 10);
        const formatted = `(${area}) ${mid}-${last}`;
        await phoneField.fill(formatted).catch(() => {});
        await phoneField.press('Tab').catch(() => {});
        await phoneField.evaluate((el) => { el.dataset.uxFilled = '1'; }).catch(() => {});
        filledCount += 1;
      }
    }

    // 4.4 Điền ô Thành phố & Zipcode Alpha Intent nếu có trên form
    const cityField = frame.locator('#city, input[data-testid="city-input"], #ai-funnel input#city, #ai-funnel input[name="city"], #alpha-intent-content input#city').first();
    if ((await cityField.count().catch(() => 0)) > 0 && (await cityField.isVisible().catch(() => false))) {
      const curCity = (await cityField.inputValue().catch(() => '')).trim();
      const targetCity = record.city || record.town || 'Clifton';
      if (!curCity || curCity.length < 2) {
        await cityField.fill(targetCity).catch(() => {});
        await cityField.press('Tab').catch(() => {});
        await cityField.evaluate((el) => { el.dataset.uxFilled = '1'; }).catch(() => {});
        filledCount += 1;
      }
    }
    const zipField = frame.locator('#zipcode, input[data-testid="zipcode-input"], #ai-funnel input#zipcode, #ai-funnel input[name="zipCode"], #ai-funnel input[name="zipcode"]').first();
    if ((await zipField.count().catch(() => 0)) > 0 && (await zipField.isVisible().catch(() => false))) {
      const curZip = (await zipField.inputValue().catch(() => '')).replace(/\D/g, '');
      const targetZip = String(record.zipcode || record.zip || '07055').replace(/\D/g, '').slice(0, 5);
      if (curZip.length !== 5 && targetZip.length === 5) {
        await zipField.fill(targetZip).catch(() => {});
        await zipField.press('Tab').catch(() => {});
        await zipField.evaluate((el) => { el.dataset.uxFilled = '1'; }).catch(() => {});
        filledCount += 1;
      }
    }

    // 4.5 Đồng bộ các ô ẩn required khác (#input-address, #input-dob, #input-phone, #input-fullname) nếu ô hiển thị đã có giá trị
    await frame.evaluate(() => {
      const addr = document.getElementById('address');
      const hiddenAddr = document.getElementById('input-address');
      if (addr && addr.value && hiddenAddr && hiddenAddr.readOnly) {
        hiddenAddr.value = addr.value;
        hiddenAddr.dispatchEvent(new Event('input', { bubbles: true }));
        hiddenAddr.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const date = document.getElementById('date');
      const hiddenDob = document.getElementById('input-dob');
      if (date && date.value && !date.value.includes('_') && hiddenDob && hiddenDob.readOnly) {
        hiddenDob.value = date.value;
        hiddenDob.dispatchEvent(new Event('input', { bubbles: true }));
        hiddenDob.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const phone = document.getElementById('phone');
      const hiddenPhone = document.getElementById('input-phone');
      if (phone && phone.value && hiddenPhone && hiddenPhone.readOnly) {
        hiddenPhone.value = phone.value;
        hiddenPhone.dispatchEvent(new Event('input', { bubbles: true }));
        hiddenPhone.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const name = document.getElementById('name');
      const hiddenName = document.getElementById('input-fullname');
      if (name && name.value && hiddenName && hiddenName.readOnly) {
        hiddenName.value = name.value;
        hiddenName.dispatchEvent(new Event('input', { bubbles: true }));
        hiddenName.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }).catch(() => {});

    // 5. Nút lưu số điện thoại phụ trong TCPA nếu xuất hiện (button.button-save-phone)
    const savePhoneBtn = frame.locator('button.button-save-phone:not([data-ux-clicked="1"]), .hidden-tcpa-input button:not([data-ux-clicked="1"])').first();
    if ((await savePhoneBtn.count().catch(() => 0)) > 0 && (await savePhoneBtn.isVisible().catch(() => false))) {
      const telInput = frame.locator('.hidden-tcpa-input input[type="tel"]').first();
      if ((await telInput.count().catch(() => 0)) > 0) {
        const rawPhone = getNormalizedPhone(record);
        const area = rawPhone.slice(0, 3);
        const mid = rawPhone.slice(3, 6);
        const last = rawPhone.slice(6, 10);
        const formatted = `(${area}) ${mid}-${last}`;
        await telInput.fill(formatted).catch(() => {});
      }
      await savePhoneBtn.evaluate((b) => b.setAttribute('data-ux-clicked', '1')).catch(() => {});
      await savePhoneBtn.click({ force: true, timeout: 1500 }).catch(() => {});
      filledCount += 1;
    }
  } catch {}

  return filledCount;
}

/**
 * Tự động chọn giới tính trên các form có custom buttons (như Uplevel Rewards #gender, .gbtn).
 * Đồng bộ giá trị vào input ẩn và xóa class invalid/error trên form container.
 *
 * @param {object} frame Frame hoặc Page của Playwright.
 * @param {object} record Dữ liệu người dùng.
 * @return {Promise<number>} Số lựa chọn giới tính đã thực hiện (0 hoặc 1).
 */
export async function handleCustomGenderButtons(frame, record = {}) {
  try {
    const genderRaw = String(record.gender || record.gioitinh || record.sex || '').trim().toLowerCase();
    const isFemale = /^(female|f|nu|woman|girl|mrs|ms|miss)$/i.test(genderRaw);
    const targetCode = isFemale ? 'F' : 'M';

    const selected = await frame.evaluate(({ targetCode, isFemale }) => {
      // 1. Tìm container gender hoặc nút gender
      const genderContainer = document.querySelector('#gender, [data-tag="gender"], .gender-group, .gender-wrapper, [data-field="gender"]');
      const maleBtn = document.querySelector('#male, .male.gbtn, [data-gender="M"], [data-gender="male"]');
      const femaleBtn = document.querySelector('#female, .female.gbtn, [data-gender="F"], [data-gender="female"]');

      if (!maleBtn && !femaleBtn && !genderContainer) return 0;

      const targetBtn = isFemale ? (femaleBtn || maleBtn) : (maleBtn || femaleBtn);
      const genderInput = document.querySelector('input#genderid, input[name="genderid"], input[name="gender"], input#gender');

      // Kiểm tra nếu đã được chọn đúng và không bị báo lỗi thì bỏ qua
      const isAlreadySelected = (targetBtn && (
        targetBtn.classList.contains('selected') ||
        targetBtn.classList.contains('active') ||
        targetBtn.dataset.uxClicked === '1'
      )) || (genderInput && genderInput.value && !genderInput.classList.contains('invalid'));

      const parentItem = (targetBtn || genderContainer)?.closest('.field-item, .form-group, .field');
      const isItemInvalid = parentItem && parentItem.classList.contains('invalid');

      if (isAlreadySelected && !isItemInvalid) return 0;

      // Click nút tương ứng
      if (targetBtn) {
        targetBtn.dataset.uxClicked = '1';
        targetBtn.click();
        targetBtn.classList.add('selected', 'active');
      }

      // Cập nhật giá trị input gender ngầm
      if (genderInput) {
        genderInput.value = targetCode;
        genderInput.dataset.uxFilled = '1';
        genderInput.classList.remove('invalid', 'error');
        genderInput.classList.add('valid', 'has-value');
        genderInput.dispatchEvent(new Event('input', { bubbles: true }));
        genderInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // Xóa trạng thái lỗi trên container cha
      if (parentItem) {
        parentItem.classList.remove('invalid', 'error');
        parentItem.classList.add('valid', 'non-empty');
        const err = parentItem.querySelector('.error-entry, .error');
        if (err) err.style.display = 'none';
      }

      return 1;
    }, { targetCode, isFemale });

    return selected || 0;
  } catch {
    return 0;
  }
}

/**
 * Điền và đồng bộ toàn diện các trường đặc thù của Uplevel Rewards (#reg-container):
 * - Định dạng số điện thoại 14 ký tự vào #tl (telephone_two)
 * - Đồng bộ 10 số thô vào input ẩn telephone, phonecode, phoneprefix, phonesuffix
 * - Nút giới tính (.gbtn, btnselected) và input#genderid
 * - Kích hoạt class .active trên nút tiếp tục #sub-btn
 *
 * @param {object} frame Frame hoặc Page của Playwright.
 * @param {object} record Dữ liệu người dùng.
 * @return {Promise<number>} Số trường/hành động đã hoàn thành trong pass này.
 */
export async function syncUplevelRewardsFields(frame, record = {}) {
  let filledCount = 0;
  if (!frame || typeof frame.evaluate !== 'function') return filledCount;

  try {
    const synced = await frame.evaluate((rec) => {
      const regContainer = document.querySelector('#reg-container, #global-reg, #cid-global');
      if (!regContainer) return 0;

      let actionsCount = 0;

      const triggerFieldEvents = (el) => {
        if (!el) return;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        if (window.jQuery) {
          try {
            window.jQuery(el).trigger('input').trigger('change').trigger('keyup').trigger('blur');
          } catch {}
        }
      };

      // 0. Bổ trợ điền nhanh các trường văn bản nếu còn rỗng trong #reg-container
      const em = document.getElementById('em') || document.querySelector('input[name="email"]');
      if (em && !em.value && rec.email) {
        em.value = rec.email;
        em.dataset.uxFilled = '1';
        triggerFieldEvents(em);
        actionsCount++;
      }

      const fn = document.getElementById('fn') || document.querySelector('input[name="firstname"]');
      const fallbackFn = rec.firstname || (rec.fullname ? rec.fullname.split(' ')[0] : '') || (rec.email ? rec.email.split('@')[0].split(/[._-]/)[0] : 'James');
      if (fn && (!fn.value || fn.value.length < 2) && fallbackFn) {
        fn.value = fallbackFn;
        fn.dataset.uxFilled = '1';
        triggerFieldEvents(fn);
        actionsCount++;
      }

      const ln = document.getElementById('ln') || document.querySelector('input[name="lastname"]');
      const fallbackLn = rec.lastname || (rec.fullname && rec.fullname.split(' ').length > 1 ? rec.fullname.split(' ').slice(1).join(' ') : '') || 'Smith';
      if (ln && (!ln.value || ln.value.length < 2) && fallbackLn) {
        ln.value = fallbackLn;
        ln.dataset.uxFilled = '1';
        triggerFieldEvents(ln);
        actionsCount++;
      }

      const ad = document.getElementById('ad') || document.querySelector('input[name="address1"]');
      const fallbackAd = rec.address || '4125 N Inspiration Loop';
      if (ad && (!ad.value || ad.value.length < 3) && fallbackAd) {
        ad.value = fallbackAd;
        ad.dataset.uxFilled = '1';
        triggerFieldEvents(ad);
        actionsCount++;
      }

      const zp = document.getElementById('zp') || document.querySelector('input[name="zippost"]');
      const fallbackZp = String(rec.zipcode || rec.zip || '99654').replace(/\D/g, '').slice(0, 5);
      if (zp && (!zp.value || zp.value.replace(/\D/g, '').length !== 5) && fallbackZp) {
        zp.value = fallbackZp;
        zp.dataset.uxFilled = '1';
        triggerFieldEvents(zp);
        actionsCount++;
      }

      const stateSelect = document.getElementById('state') || document.querySelector('select[name="state"]');
      const targetState = (rec.state || 'AK').toUpperCase();
      if (stateSelect && (!stateSelect.value || stateSelect.value.length < 2)) {
        let matchedOpt = Array.from(stateSelect.options).find((o) => o.value.toUpperCase() === targetState);
        if (!matchedOpt) {
          matchedOpt = Array.from(stateSelect.options).find((o) => o.value && !/select|state/i.test(o.text));
        }
        if (matchedOpt) {
          stateSelect.value = matchedOpt.value;
          stateSelect.dataset.uxFilled = '1';
          triggerFieldEvents(stateSelect);
          actionsCount++;
        }
      }

      const ct = document.getElementById('ct') || document.querySelector('input[name="city"]');
      const fallbackCt = rec.city || rec.town || 'Wasilla';
      if (ct && (!ct.value || ct.value.length < 2) && fallbackCt) {
        ct.value = fallbackCt;
        ct.dataset.uxFilled = '1';
        triggerFieldEvents(ct);
        actionsCount++;
      }

      // 1. Đồng bộ Telephone & các hidden input của Uplevel Rewards
      const tl = document.getElementById('tl') || document.querySelector('input[name="telephone_two"]');
      const rawDigits = String(rec.phone || rec.phonenumber || rec.cellphone || '').replace(/\D/g, '');
      const valid10 = (rawDigits.length >= 10) ? rawDigits.slice(-10) : '8145551234';
      const formatted14 = `(${valid10.slice(0, 3)}) ${valid10.slice(3, 6)}-${valid10.slice(6, 10)}`;

      if (tl) {
        if (!tl.value || tl.value.replace(/\D/g, '').length < 10 || tl.value.length < 14) {
          tl.value = formatted14;
          tl.dataset.uxFilled = '1';
          tl.classList.remove('invalid', 'error');
          tl.classList.add('valid', 'has-value');
          triggerFieldEvents(tl);
          actionsCount++;
        }
      }

      // Luôn đồng bộ 4 hidden input mà trang web dùng để gửi lead và validate
      const telHidden = document.querySelector('input[name="telephone"]');
      if (telHidden && telHidden.value !== valid10) {
        telHidden.value = valid10;
        triggerFieldEvents(telHidden);
      }
      const codeHidden = document.querySelector('input[name="phonecode"]');
      if (codeHidden && codeHidden.value !== valid10.slice(0, 3)) {
        codeHidden.value = valid10.slice(0, 3);
      }
      const prefixHidden = document.querySelector('input[name="phoneprefix"]');
      if (prefixHidden && prefixHidden.value !== valid10.slice(3, 6)) {
        prefixHidden.value = valid10.slice(3, 6);
      }
      const suffixHidden = document.querySelector('input[name="phonesuffix"]');
      if (suffixHidden && suffixHidden.value !== valid10.slice(6, 10)) {
        suffixHidden.value = valid10.slice(6, 10);
      }

      // 2. Đồng bộ Giới tính (Gender Buttons: #male, #female, .gbtn)
      const genderRaw = String(rec.gender || rec.gioitinh || rec.sex || '').trim().toLowerCase();
      const isFemale = /^(female|f|nu|woman|girl|mrs|ms|miss)$/i.test(genderRaw);
      const targetCode = isFemale ? 'F' : 'M';

      const maleBtn = document.querySelector('#male, .male.gbtn, [data-gender="M"]');
      const femaleBtn = document.querySelector('#female, .female.gbtn, [data-gender="F"]');
      const targetBtn = isFemale ? (femaleBtn || maleBtn) : (maleBtn || femaleBtn);
      const otherBtn = isFemale ? maleBtn : femaleBtn;

      if (targetBtn) {
        if (!targetBtn.classList.contains('btnselected')) {
          targetBtn.classList.add('btnselected', 'selected', 'active');
          if (otherBtn) otherBtn.classList.remove('btnselected', 'selected', 'active');
          try { targetBtn.click(); } catch {}
          actionsCount++;
        }
      }

      const genderInput = document.querySelector('input#genderid, input[name="genderid"], input[name="gender"]');
      if (genderInput && genderInput.value !== targetCode) {
        genderInput.value = targetCode;
        genderInput.dataset.uxFilled = '1';
        triggerFieldEvents(genderInput);
        actionsCount++;
      }

      // Xóa class invalid và thêm valid non-empty trên toàn bộ field-item đã có dữ liệu hợp lệ
      document.querySelectorAll('#reg-container .field-item, #global-reg .field-item').forEach((item) => {
        const inp = item.querySelector('input, select');
        if (inp && inp.value && String(inp.value).trim().length > 0) {
          item.classList.remove('invalid');
          item.classList.add('valid', 'non-empty');
          const err = item.querySelector('.error-entry');
          if (err) err.style.display = 'none';
        }
      });

      // 3. Kích hoạt validator và bật sáng nút Continue (#sub-btn)
      if (window.LMReg && typeof window.LMReg.validateReg2 === 'function') {
        try { window.LMReg.validateReg2(); } catch {}
      }

      const subBtn = document.getElementById('sub-btn');
      if (subBtn && !subBtn.classList.contains('active')) {
        const hasEm = Boolean(document.getElementById('em')?.value);
        const hasFn = Boolean(document.getElementById('fn')?.value);
        const hasLn = Boolean(document.getElementById('ln')?.value);
        const hasAd = Boolean(document.getElementById('ad')?.value);
        const hasZp = Boolean(document.getElementById('zp')?.value);
        const hasCt = Boolean(document.getElementById('ct')?.value);
        const hasSt = Boolean(document.getElementById('state')?.value);
        const hasTl = Boolean(document.getElementById('tl')?.value);
        if (hasEm && hasFn && hasLn && hasAd && hasZp && hasCt && hasSt && hasTl) {
          subBtn.classList.add('active');
        }
      }

      return actionsCount;
    }, record).catch(() => 0);

    filledCount += synced;
  } catch {}

  return filledCount;
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
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-21
 */
/** Số lần tối đa một phiên được đổi email/record khi form từ chối, tránh đốt hết hàng đợi vì một offer lỗi. */
export const MAX_REJECT_ROTATIONS = 3;

/**
 * Khi form từ chối email hoặc thông tin đã điền (cùng ô bị báo lỗi ≥ 2 lần trong phiên), xin dữ liệu mới
 * qua options.onFormRejected (app đưa email/record cũ vào danh sách bị từ chối, không dùng lại) rồi xoá
 * giá trị cũ trên form để lượt quét sau điền lại bằng dữ liệu mới.
 * Ô trống báo "required" là do mình chưa điền, không tính là dữ liệu bị từ chối.
 *
 * @param {object} frame Frame chứa form.
 * @param {object} record Record đang dùng cho tab (bị sửa trực tiếp).
 * @param {object} session Phiên đang chạy.
 * @param {object} options Tuỳ chọn attachAutofill (onFormRejected, onLog).
 * @param {object} err Kết quả phát hiện lỗi sau submit (firstError, fieldName, fieldId, fieldType, fieldValue, allErrors).
 * @return {Promise<boolean>} True nếu đã đổi sang dữ liệu mới.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-28
 */
export async function rotateRejectedFormData(frame, record, session, options, err) {
  if (typeof options.onFormRejected !== 'function' || !record) return false;
  const fieldText = `${err.fieldName || ''} ${err.fieldId || ''} ${err.fieldType || ''}`;
  const errorText = [err.firstError, ...(err.allErrors || [])].filter(Boolean).join(' | ');
  const isEmail = /mail/i.test(fieldText) || (!err.fieldName && !err.fieldId && /e-?mail/i.test(errorText));
  // Ô trống: lỗi do chưa điền chứ không phải dữ liệu bị từ chối.
  if (!err.fieldValue && !(isEmail && session.emailFilled)) return false;
  const key = isEmail ? 'email' : (err.fieldName || err.fieldId || 'field');
  session._rejectCounts = session._rejectCounts || {};
  session._rejectCounts[key] = (session._rejectCounts[key] || 0) + 1;
  // Trang nói rõ email bị từ chối (invalid / đã dùng / bị chặn) → đổi ngay. Lỗi khác có thể do trang
  // kiểm tra chậm hoặc gõ chưa xong: cho thử lại một lần.
  const explicitEmailReject = isEmail && /invalid|not valid|already|in use|exists|registered|blocked|undeliverable|not allowed|not accepted/i.test(errorText);
  if (!explicitEmailReject && session._rejectCounts[key] < 2) return false;
  session._rejectRotations = (session._rejectRotations || 0) + 1;
  if (session._rejectRotations > MAX_REJECT_ROTATIONS) return false;
  session._rejectCounts[key] = 0;
  const oldValue = isEmail ? (session.assignedEmail || record.email || '') : err.fieldValue;
  const replacement = await Promise.resolve(options.onFormRejected(session, { kind: isEmail ? 'email' : 'record', field: key, error: errorText, record }))
    .catch(() => null);
  if (!replacement) {
    options.onLog?.({ type: 'form_rejected_no_data', detail: `Form từ chối ${isEmail ? 'email' : `ô ${key}`} (${errorText}) nhưng đã hết dữ liệu mới để thay.` });
    return false;
  }
  if (isEmail) {
    Object.assign(record, { email: replacement.email, emailaddress: replacement.email, mail: replacement.email, assignedEmail: replacement.email });
    session.emailFilled = false;
    session.emailFillAt = 0;
    session.emailScreenSubmitted = false;
  } else {
    const keepEmail = { email: record.email, emailaddress: record.emailaddress, mail: record.mail, assignedEmail: record.assignedEmail };
    Object.keys(record).forEach((k) => { delete record[k]; });
    Object.assign(record, replacement, Object.fromEntries(Object.entries(keepEmail).filter(([, v]) => v)));
  }
  // Xoá giá trị cũ + cờ đã điền để lượt quét sau gõ lại bằng dữ liệu mới.
  await frame.evaluate((onlyEmail) => {
    document.querySelectorAll('input, textarea, select').forEach((el) => {
      if (!el.hasAttribute('data-ux-filled')) return;
      if (onlyEmail && !/mail/i.test(`${el.name} ${el.id} ${el.type}`)) return;
      el.removeAttribute('data-ux-filled');
      if (!['checkbox', 'radio', 'hidden', 'submit', 'button'].includes(el.type)) {
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }, isEmail).catch(() => {});
  options.onLog?.({
    type: isEmail ? 'email_rejected_rotated' : 'record_rejected_rotated',
    detail: isEmail
      ? `Form từ chối email ${oldValue} (${errorText}); đã cho vào danh sách bị từ chối và đổi sang ${replacement.email}.`
      : `Form từ chối ô ${key} = "${String(oldValue).slice(0, 40)}" (${errorText}); đã bỏ record này và đổi sang record mới.`,
  });
  return true;
}

/**
 * Tab (kể cả iframe) có ô email đang hiển thị không. Mặc định chỉ tính ô đã có email (chứa "@").
 *
 * @param {object} page Tab Playwright.
 * @param {{anyValue?: boolean}} [opts] anyValue: tính cả ô email rỗng.
 * @return {Promise<boolean>} True nếu có ô email hiển thị thoả điều kiện.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-31
 */
export async function pageHasVisibleFilledEmail(page, { anyValue = false } = {}) {
  for (const scanFrame of (typeof page.frames === 'function' ? page.frames() : [page])) {
    const hasEmail = await scanFrame.evaluate((any) => {
      const inputs = Array.from(document.querySelectorAll('input[type="email"], input[name*="email" i], input[id*="email" i]'));
      return inputs.some((i) => {
        if (i.type === 'hidden') return false;
        if (!any && !String(i.value || '').trim().includes('@')) return false;
        // Ô địa chỉ nhà bị bắt nhầm; "emailAddress"/"email_address" vẫn là ô email.
        const key = i.name || i.id || '';
        if (/street/i.test(key) || (/address/i.test(key) && !/mail/i.test(key))) return false;
        const s = getComputedStyle(i);
        if (s.display === 'none' || s.visibility === 'hidden') return false;
        const r = i.getBoundingClientRect();
        return r.width > 2 && r.height > 2;
      });
    }, anyValue).catch(() => false);
    if (hasEmail) return true;
  }
  return false;
}

export function attachAutofill(context, records, allowedOrigin, session = {}, options = {}) {
  // offerStrategy: { mode: 'auto_full' | 'consent_only' | 'manual' | 'skip', ... } từ offerStrategyState
  // Không tự tạo record mẫu: chỉ dùng record trong danh sách app cung cấp. Hết record thì dùng record rỗng
  // (không điền gì từ record) và báo log để người dùng nạp thêm dữ liệu.
  const hasRecords = Array.isArray(records) && records.length > 0;
  const effectiveRecords = hasRecords ? records : [{}];
  if (!hasRecords) {
    options.onLog?.({ type: 'autofill_records_empty', detail: 'Hết record trong danh sách "Dữ liệu tự điền"; không tự tạo dữ liệu, hãy nạp thêm record.' });
  }
  const trackedPages = new WeakSet();

  // Giải quyết chiến lược giải offer cho phiên này (mặc định Cách 1 / auto_full).
  // offerMethod: 1-4 (Cách giải tương ứng với Offer 1-4), mode: auto_full | consent_only | manual | skip
  const strategy = options.offerStrategy || {};
  options = {
    ...options,
    autoSubmit: options.autoSubmit !== false && strategy.autoSubmit !== false,
    maxPick: Number.isInteger(Number(strategy.maxPick)) && Number(strategy.maxPick) > 0
      ? Number(strategy.maxPick) : options.maxPick,
    // pickRandom: true = chọn ngẫu nhiên (mặc định giữ hành vi cũ);
    // false = không tự điền câu hỏi nhiều đáp án (chỉ điền khi có dữ liệu thực tế).
    pickRandom: strategy.pickRandom !== false,
  };
  const offerMethod = Number(strategy.offerMethod || strategy.methodNumber || 1);
  const offerMode = (strategy.mode || 'auto_full').toString();
  session.offerStrategy = strategy;

  // Ánh xạ Cách giải -> mode (nếu strategy chưa có mode):
  // Cách 1 = auto_full (điền toàn bộ form + submit), Cách 2 = consent_only (chỉ tick consent),
  // Cách 3 = manual (không tự động), Cách 4 = skip (bỏ qua offer).
  if (!strategy.mode) {
    const methodModeMap = { 1: 'auto_full', 2: 'consent_only', 3: 'manual', 4: 'skip' };
    const mappedMode = methodModeMap[offerMethod] || 'auto_full';
    session.offerMethod = offerMethod;
    session.offerMode = mappedMode;
  } else {
    session.offerMethod = offerMethod;
    session.offerMode = offerMode;
  }

  // Nếu chế độ 'skip': bỏ qua hoàn toàn, không khởi chạy autofill.
  if (session.offerMode === 'skip') {
    options.onLog?.({ type: 'offer_skipped', detail: 'Offer bị bỏ qua theo Cách giải 4 (skip).' }, null);
    return;
  }

  // Nếu chế độ 'manual': không tự động điền form, chờ người thao tác thủ công.
  if (session.offerMode === 'manual') {
    options.onLog?.({ type: 'offer_manual', detail: 'Offer chạy theo Cách giải 3 (thủ công). Đang chờ người thao tác...' }, null);
    return;
  }

  // Chọn 1 bản ghi duy nhất cho toàn bộ phiên này để nhất quán xuyên suốt các trang/bước/frame.
  // Chọn theo con trỏ xoay vòng (không random): tránh việc lượt sau điền lại đúng record
  // của lượt trước khi pool tái dùng (used) hoặc khi available được nạp lại toàn bộ.
  if (session.recordIndex === undefined || session.recordIndex < 0 || session.recordIndex >= effectiveRecords.length) {
    // Con trỏ chia sẻ trên chính mảng pool: nhiều session (các cửa sổ chạy song song) dùng chung
    // pool sẽ lần lượt lấy record khác nhau, không trùng cho tới khi đi hết vòng.
    const cursorKey = '__uxRecordCursor';
    if (!(cursorKey in effectiveRecords)) effectiveRecords.__uxRecordCursor = 0;
    session.recordIndex = effectiveRecords.__uxRecordCursor % effectiveRecords.length;
    effectiveRecords.__uxRecordCursor = (session.recordIndex + 1);
  }
  // BẢO VỆ ĐA TRÌNH DUYỆT: clone bản ghi ra 1 object riêng cho phiên này.
  // Pool (effectiveRecords) là mảng DÙNG CHUNG giữa các slot chạy song song — nếu không clone,
  // mutation ghi email/session của slot này sẽ đè lên record mà slot khác đang dùng cùng lúc.
  const sourceRecord = effectiveRecords[session.recordIndex];
  const record = (sourceRecord && typeof sourceRecord === 'object')
    ? JSON.parse(JSON.stringify(sourceRecord))
    : sourceRecord;
  if (session.assignedEmail && record) {
    record.email = session.assignedEmail;
    record.emailaddress = session.assignedEmail;
    record.mail = session.assignedEmail;
    record.assignedEmail = session.assignedEmail;
  }
  session.autofillRecord = session.recordIndex + 1;
  options.onRecordPicked?.(record);

  /**
   * Bật check lead cho phiên (dùng chung mọi tab): đặt cờ tạm dừng autofill rồi gọi app chờ lead.
   *
   * @param {object} page Tab vừa qua màn email.
   * @return {void}
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-10-31
   */
  function triggerLeadCheckAfterEmail(page) {
    if (session.leadCheckTriggered || session.screen5LeadCheckTriggered) return;
    session.screen5LeadCheckTriggered = true;
    session.leadCheckTriggered = true;
    session.leadCheckStatus = 'checking';
    session.leadCheckReason = 'screen_target';
    console.log(`[LeadCheck] Đã qua màn email (đã hoàn thành ${session.completedScreens || 0} màn). Bắt đầu tạm dừng và chờ kiểm tra lead...`);
    options.onLog?.({
      type: 'screen_target_lead_check',
      detail: `Đã qua màn email (hoàn thành ${session.completedScreens || 0} màn). Bắt đầu chờ đợi lead (1 lần x 20s)...`,
    }, page);
    if (typeof options.onEmailSubmitted === 'function') {
      options.onEmailSubmitted(session, page);
    } else if (typeof options.onScreen5Reached === 'function') {
      options.onScreen5Reached(session, page);
    }
  }

  /**
   * Kiểm tra riêng từng tab, không phụ thuộc lượt autofill: lượt quét bỏ qua cả lượt khi AI đang chạy trên tab
   * hoặc lượt trước còn kẹt, nên tab 1 đã qua màn email vẫn không được check lead, phải đợi tab 2 điền email.
   * Tab đã từng thấy ô email có giá trị, sau đó ô email biến mất hoặc URL đổi → tab này đã qua màn email → check ngay.
   *
   * @param {object} page Tab cần kiểm tra.
   * @return {Promise<void>}
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-10-31
   */
  async function checkLeadAfterEmailOnPage(page) {
    if (options.enableLeadCheck === false || session.screen5LeadVerified || page._uxLeadChecking || page.isClosed()) return;
    if (session.leadCheckTriggered || session.screen5LeadCheckTriggered || session.leadCheckStatus) return;
    page._uxLeadChecking = true;
    try {
      const url = page.url().split('#')[0];
      const emailVisible = await pageHasVisibleFilledEmail(page);
      if (emailVisible) {
        page._uxEmailSeenUrl = url;
        return;
      }
      if (!page._uxEmailSeenUrl || page.isClosed()) return;
      // Ô email còn trên màn nhưng rỗng (form từ chối, app xoá để gõ email khác) thì chưa qua màn.
      // Ô email vừa biến mất: chờ 1 nhịp rồi xem lại, tránh lúc trang đang vẽ lại chính màn email.
      if (await pageHasVisibleFilledEmail(page, { anyValue: true })) return;
      await new Promise((r) => setTimeout(r, 700));
      if (page.isClosed() || await pageHasVisibleFilledEmail(page, { anyValue: true })) return;
      session.emailFilled = true;
      session.emailFillAt = session.emailFillAt || Date.now();
      session.emailScreenSubmitted = true;
      triggerLeadCheckAfterEmail(page);
    } catch {
      // Trang đang điều hướng / đóng: lần kiểm tra sau chạy lại.
    } finally {
      page._uxLeadChecking = false;
    }
  }

  /**
   * Điền các trường còn trống trên form đang hiển thị của một trang và các frame con.
   *
   * @param {object} page Trang Chrome cần xử lý.
   * @return {Promise<void>} Hoàn tất lượt quét form.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-10-21
   */
  async function fillVisibleForms(page) {
    if (page.isClosed()) return;
    const record = page._assignedRecord || session.currentRecord || effectiveRecords[session.recordIndex];
    // Record của tab lấy riêng từ hàng đợi nên chưa có email của phiên: gắn vào để mọi nhánh điền (kể cả điền cứu trợ, AI) dùng đúng email.
    if (record && session.assignedEmail && record.assignedEmail !== session.assignedEmail) {
      Object.assign(record, { email: session.assignedEmail, emailaddress: session.assignedEmail, mail: session.assignedEmail, assignedEmail: session.assignedEmail });
    }
    const hasRecordData = record && typeof record === 'object' && Object.keys(record).filter((k) => record[k]).length > 0;
    if (!hasRecordData && !page._uxRecordEmptyLogged) {
      page._uxRecordEmptyLogged = true;
      options.onLog?.({
        type: 'record_pool_empty',
        detail: `[Scan] CẢNH BÁO: Record rỗng — không có dữ liệu để điền form! Kiểm tra hàng đợi record (tab Proxy).`,
      });
    }
    if (session.offerMode === 'consent_only') {
      for (const frame of (typeof page.frames === 'function' ? page.frames() : [page])) {
        const boxes = await frame.locator('input[type="checkbox"]').all().catch(() => []);
        for (const box of boxes) {
          const consent = await box.evaluate((el) => {
            const label = el.closest('label') || (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
            return /consent|terms|privacy|agree|tcpa|disclosure|policy/i.test(
              `${el.name || ''} ${el.id || ''} ${label?.textContent || ''}`,
            );
          }).catch(() => false);
          if (consent && await box.isVisible().catch(() => false) && !await box.isChecked().catch(() => true)) {
            await box.check({ timeout: 1500 }).catch(() => {});
          }
        }
      }
      return;
    }
    if (session.leadCheckStatus === 'failed') return;
    if (session.leadCheckStatus === 'checking') return;
    if (options.enableLeadCheck !== false && (session.screen5LeadCheckTriggered || session.leadCheckTriggered) && !session.screen5LeadVerified) return;

    // PHÁT HIỆN EMAIL ĐIỀN NGOÀI (RoboForm/extension/tay) — nếu các cờ thường không bắt được,
    // quét nhanh các ô email hiển thị có giá trị trong page + frame con để bật cờ emailFilled,
    // nếu không guard "chưa điền email" sẽ chặn vĩnh viễn việc check lead.
    const hasVisibleFilledEmail = () => pageHasVisibleFilledEmail(page);
    if (!session.emailFilled) {
      if (await hasVisibleFilledEmail()) {
        session.emailFilled = true;
        session.emailFillAt = session.emailFillAt || Date.now();
        session.emailScreenNumber = session.emailScreenNumber || (session.completedScreens || 1);
        session.screenHasEmail = true;
        console.log(`[Autofill] Phát hiện email đã có sẵn trong form (RoboForm/extension/tay). Đánh dấu emailFilled=true để luồng check lead hoạt động.`);
        options.onLog?.({ type: 'email_filled_external', detail: 'Phát hiện email đã có sẵn trong form (extension/tay) — bật cờ emailFilled để check lead.' });
      }
    }

    // Nếu đang trong quá trình kiểm tra lead mà chưa xác nhận: tạm dừng không thao tác
    if (options.enableLeadCheck !== false && !session.screen5LeadVerified) {
      if (session.screen5LeadCheckTriggered || session.leadCheckTriggered) {
        return;
      }
      // AI assist và nhánh quét giá trị có sẵn chỉ bật emailFilled, không ghi emailFillAt:
      // bắt đầu đếm từ lần đầu thấy cờ, nếu không nhánh bảo hiểm bên dưới không bao giờ chạy.
      if (session.emailFilled && !session.emailFillAt) session.emailFillAt = Date.now();
      // Chỉ check lead khi đã NHẢY QUA màn email, không phải chỉ điền/bấm submit: form còn lỗi (zip/tuổi sai)
      // thì vẫn đứng ở màn email, check lúc này sẽ dừng autofill mà không bao giờ có lead.
      // "Đã qua" = ô email đã biến mất khỏi màn, hoặc URL đã khác URL lúc bấm submit màn email.
      const passedEmailScreen = async () => !(await hasVisibleFilledEmail())
        || Boolean(session.emailSubmitUrl && page.url() !== session.emailSubmitUrl);
      if (session.emailFilled
        // Đã bấm submit màn email, hoặc (AI bấm / Gravity Forms chuyển bước bằng AJAX) đã điền email quá 8s.
        && (session.emailScreenSubmitted || Date.now() - session.emailFillAt > 8000)
        && await passedEmailScreen()) {
        triggerLeadCheckAfterEmail(page);
        return;
      }
    }

    const currentUrl = page.url();
    const scanStartUrl = currentUrl; // URL lúc bắt đầu lượt quét (trước mọi click submit), dùng để biết đã qua màn email chưa
    if (!currentUrl || currentUrl.startsWith('about:') || currentUrl.startsWith('chrome:') || currentUrl.startsWith('chrome-error:')) return;

    if (!session.initialFormUrl) {
      session.initialFormUrl = currentUrl;
    }

    // Tự nhiên hóa nhịp độ quan sát trang khi vừa chuyển sang URL mới (trên trình duyệt thật):
    const isRealBrowser = Boolean(page?.mouse && typeof page.mouse.move === 'function');
    if (session.lastObservedUrl && session.lastObservedUrl !== currentUrl) {
      session.pageJumps = (session.pageJumps || 0) + 1;
      session.screenReached = Math.max(session.screenReached || 1, (session.completedScreens || 0) + 1);
      options.onPageJump?.(session, session.pageJumps, currentUrl);
    }
    if (isRealBrowser && session.lastObservedUrl !== currentUrl) {
      session.lastObservedUrl = currentUrl;
      const observationPause = Math.floor(Math.random() * 300) + 350; // 350ms - 650ms
      await new Promise((r) => setTimeout(r, observationPause));
      // Cuộn nhẹ xem lướt qua trang và vi chuyển động chuột tự nhiên
      try {
        await humanWheelScroll(page, Math.floor(Math.random() * 80) + 120);
        await naturalMouseDrift(page, 1);
      } catch {}
    } else {
      session.lastObservedUrl = currentUrl;
    }


    // Tự động phát hiện và cuộn tới widget nhúng LocoTomato (.loco-widget) hoặc iframe form nhúng để kích hoạt hiển thị
    try {
      if (typeof page.locator === 'function') {
        const locoWidget = page.locator('.loco-widget, [data-loco-widget], iframe[src*="locotomato.com"]').first();
        if ((await locoWidget.count().catch(() => 0)) > 0) {
          await locoWidget.scrollIntoViewIfNeeded({ timeout: 1200 }).catch(() => {});
        }
      }
    } catch {}

    const frames = typeof page.frames === 'function' ? page.frames() : [page];
    const unmatchedFieldNames = new Set();
    let visibleFieldCount = 0;

    for (const frame of frames) {
      if (session.leadCheckStatus === 'failed' || session.leadCheckStatus === 'checking' || (options.enableLeadCheck !== false && (session.screen5LeadCheckTriggered || session.leadCheckTriggered) && !session.screen5LeadVerified)) return;

      // Frame không phản hồi (iframe quảng cáo đang tải dở, bị chặn hoặc đứng) làm frame.evaluate chờ vô hạn,
      // kéo theo cả lượt quét kẹt và tab không bao giờ được điền tiếp. Hỏi thăm có giới hạn, không trả lời thì bỏ qua.
      if (frame !== page && typeof frame.evaluate === 'function') {
        session.autofillStep = `kiểm tra frame ${typeof frame.url === 'function' ? frame.url() : ''}`;
        const responsive = await Promise.race([
          frame.evaluate(() => true).catch(() => false),
          new Promise((resolve) => setTimeout(() => resolve(false), 3000)),
        ]);
        if (!responsive) continue;
      }
      session.autofillStep = `điền frame ${typeof frame.url === 'function' ? frame.url() : ''}`;

      let filledInThisPass = 0;
      let frameHasEmail = false;

      // Xử lý thẻ khảo sát co-reg "twy" (Yes/No random + điền subform + bấm Continue)
      // Chạy 1 lần mỗi ~2s mỗi frame để không spam click
      const nowTwy = Date.now();
      if (!frame._uxTwyHandledAt || (nowTwy - frame._uxTwyHandledAt) > 2000) {
        frame._uxTwyHandledAt = nowTwy;
        try {
          await handleTwyOfferCards(frame, record, { onLog: options.onLog });
        } catch (twyErr) {
          console.log(`[TwyCards] Lỗi xử lý thẻ co-reg: ${twyErr.message}`);
        }
      }

      // Xử lý khảo sát co-reg "adsmith forge" (#AS_SURVEY iframe): focus frame + trả lời + Continue
      try {
        await handleAdsmithSurvey(page, frame, { onLog: options.onLog });
      } catch (asErr) {
        console.log(`[AsSurvey] Lỗi xử lý khảo sát adsmith: ${asErr.message}`);
      }

      // Xử lý thẻ SOI yes/no "alpha-intent" (SweepstakesAlerts/PrizeGrab): tick consent + chọn Yes/No 70/30
      try {
        await handleAlphaIntentSoiCards(page, frame, { onLog: options.onLog });
      } catch (soiErr) {
        console.log(`[AlphaSOI] Lỗi xử lý thẻ SOI: ${soiErr.message}`);
      }

      // Tự trả lời các màn câu hỏi khảo sát alpha-intent (button[id^="answer-"], question-answer-button)
      try {
        await handleAlphaIntentQuestions(page, frame, { onLog: options.onLog });
      } catch (qErr) {
        console.log(`[AlphaQ] Lỗi xử lý câu hỏi khảo sát: ${qErr.message}`);
      }

      // Câu hỏi semantic (age / preference / vehicle) theo tài liệu nghiên cứu §17:
      // phân loại → match record / block-score → click; mơ hồ thì không bấm.
      try {
        await handleSurveySemanticQuestions(page, frame, {
          onLog: options.onLog,
          record: page._assignedRecord || (typeof session !== 'undefined' && session && session.currentRecord) || {},
        });
      } catch (semErr) {
        console.log(`[SemanticQ] Lỗi xử lý câu hỏi age/vehicle/preference: ${semErr.message}`);
      }

      // Xử lý màn offer-wall "Take the Deal" (iframe sdk.scrptk.com): chọn task → CTA → Skip
      try {
        await handleOfferwallTasks(page, frame, { onLog: options.onLog });
      } catch (owErr) {
        console.log(`[OWTask] Lỗi xử lý offer-wall task: ${owErr.message}`);
      }

      // Xử lý màn câu hỏi MUI (#questionText + button[data-tf-element-role="submit"]): random đáp án
      try {
        await handleMuiQuestionButtons(page, frame, { onLog: options.onLog });
      } catch (muiErr) {
        console.log(`[MuiQ] Lỗi xử lý câu hỏi MUI: ${muiErr.message}`);
      }

      // Xử lý màn Google OAuth grant ("Continue Through Gmail"): bấm Skip bỏ qua
      try {
        await handleGoogleOauthSkip(page, frame, { onLog: options.onLog });
      } catch (gErr) {
        console.log(`[GmailSkip] Lỗi xử lý màn Gmail OAuth: ${gErr.message}`);
      }

      // Tự động trích xuất thông tin có sẵn trong globalData/geolocation/jLead để làm giàu record phiên này
      try {
        const prepopData = await extractPrepopulatedDataFromPage(frame);
        if (prepopData && typeof prepopData === 'object') {
          for (const [k, v] of Object.entries(prepopData)) {
            if (v && (!record[k] || record[k] === '')) {
              record[k] = v;
            }
          }
        }
      } catch {}

      // Xử lý và đồng bộ toàn bộ các trường đặc thù của Alpha Intent / Web Components:
      // #name, #input-fullname, #input-gender, #has_tcpa_optin, #input-address, #input-dob, #input-phone
      const alphaFilled = await fillAlphaIntentSpecialFields(frame, record);
      if (alphaFilled > 0) {
        filledInThisPass += alphaFilled;
        addVerifiedFieldCount(session, alphaFilled);
        options.onLog?.({ type: 'field_filled', detail: `Đã điền và đồng bộ ${alphaFilled} trường đặc thù Alpha Intent.` }, page);
      }

      // Xử lý custom Gender buttons (#gender, #male, #female, .gbtn) như trên Uplevel Rewards
      const customGenderCount = await handleCustomGenderButtons(frame, record);
      if (customGenderCount > 0) {
        filledInThisPass += customGenderCount;
        addVerifiedFieldCount(session, customGenderCount);
        options.onLog?.({ type: 'field_filled', detail: `Đã chọn giới tính ${record.gender || 'M'} trên custom button.` }, page);
      }

      // Xử lý và đồng bộ toàn diện các trường đặc thù của Uplevel Rewards (#reg-container, telephone_two mask, raw 10 digits hidden, buttons, active)
      const uplevelSynced = await syncUplevelRewardsFields(frame, record);
      if (uplevelSynced > 0) {
        filledInThisPass += uplevelSynced;
        addVerifiedFieldCount(session, uplevelSynced);
        options.onLog?.({ type: 'field_filled', detail: `Đã đồng bộ ${uplevelSynced} trường/trạng thái Uplevel Rewards (#reg-container).` }, page);
      }

      // 0. ƯU TIÊN HÀNG ĐẦU: Tự động bấm nút khảo sát / btn-option / radio ngay lập tức
      // để không bị trễ do phải duyệt qua danh sách các input ẩn trên các trang khảo sát
      try {
        const answeredSurvey = await handleRadioAndSurveyOptions(frame, record, session);
        if (answeredSurvey > 0) {
          filledInThisPass += answeredSurvey;
          session.lastActionTime = Date.now();
          addActionCount(session, answeredSurvey);
          session.autofillError = null;
          options.onLog?.({
            type: 'survey_answered',
            detail: `Đã tự động chọn câu trả lời khảo sát/lựa chọn (${answeredSurvey} câu).`,
          }, page);
        }

        // Tích hợp SurveySolver chuyên sâu (Ratings, Matrix, Custom Checkboxes)
        if (session.offerMode !== 'consent_only') {
          const surveySolverRes = await solveSurveyStep(frame, record, { ...options, autoClickNext: false });
          if (surveySolverRes.answeredCount > 0) {
            filledInThisPass += surveySolverRes.answeredCount;
            session.lastActionTime = Date.now();
            addActionCount(session, surveySolverRes.answeredCount);
            session.autofillError = null;
            options.onLog?.({
              type: 'survey_solver_answered',
              detail: `[SurveySolver] Đã tự động giải quyết ${surveySolverRes.answeredCount} câu hỏi khảo sát/checkbox.`,
            }, page);
          }
        } else {
          options.onLog?.({ type: 'consent_only_skip_survey', detail: 'Chế độ consent_only: bỏ qua giải khảo sát.' }, page);
        }
      } catch {}

      let fields = [];
      try {
        fields = await frame.locator('input, textarea, select').all();
      } catch {
        continue;
      }

      // Tự động xử lý Phone Modal nếu xuất hiện (đặc trưng trên 16.dlysurge.com & 16.gettngood.com)
      try {
        const phoneModalInput = frame.locator('#update-phone-modal-input, input.update-phone-modal-input').first();
        if ((await phoneModalInput.count().catch(() => 0)) > 0 && (await phoneModalInput.isVisible().catch(() => false))) {
          const rawPhone = getNormalizedPhone(record);
          const area = rawPhone.slice(0, 3);
          const mid = rawPhone.slice(3, 6);
          const last = rawPhone.slice(6, 10);
          const formattedPhone = `(${area}) ${mid}-${last}`;
          await humanType(phoneModalInput, formattedPhone, page);
          const submitModalBtn = frame.locator('#update-phone-modal-submit, button.update-phone-modal-submit').first();
          if ((await submitModalBtn.count().catch(() => 0)) > 0 && (await submitModalBtn.isVisible().catch(() => false))) {
            await submitModalBtn.click({ force: true, timeout: 1500 });
            filledInThisPass += 1;
            addVerifiedFieldCount(session, 1);
          }
        }
      } catch {}

          for (const field of fields) {
          if (session.leadCheckStatus === 'failed') return;
          try {
            const isEnabled = await field.isEnabled().catch(() => true);
            if (!isEnabled) {
              // Log 1 lần mỗi ô mỗi pass để truy vết trường bị khóa (fieldset disabled)
              const skipId = await field.evaluate((el) => el.id || el.name || '').catch(() => '');
              if (skipId && !page._uxDisabledSkipLogged) page._uxDisabledSkipLogged = new Set();
              if (skipId && !page?._uxDisabledSkipLogged?.has(skipId)) {
                page._uxDisabledSkipLogged.add(skipId);
                options.onLog?.({
                  type: 'field_disabled_skip',
                  field: skipId,
                  detail: `[Scan] Bỏ qua ô "${skipId}" vì trường đang disabled (fieldset/step khóa)`,
                });
              }
              continue;
            }

          // Bảo vệ chống bẫy honeypot (như trên find.mysamplesearchtwentythree.com):
          const isHoneypot = await field.evaluate((el) => {
            if (el.closest('[inert]')) return true;
            const parent = el.closest('div, span');
            if (parent) {
              const s = parent.style;
              if (s.left === '-9999px' || s.top === '-9999px' || (s.opacity === '0' && s.width === '1px')) return true;
            }
            const rect = el.getBoundingClientRect();
            if (rect.left < -100 || rect.top < -100 || (rect.width <= 1 && rect.height <= 1)) return true;
            const name = (el.name || el.id || '').toLowerCase();
            if (['website', 'address3', 'confirm_email', 'emailidaddress'].includes(name) && rect.top < 0) return true;
            return false;
          }).catch(() => false);
          if (isHoneypot) {
            const hpId = await field.evaluate((el) => el.id || el.name || '').catch(() => '');
            if (!page._uxHoneypotLogged) page._uxHoneypotLogged = new Set();
            if (hpId && !page._uxHoneypotLogged.has(hpId)) {
              page._uxHoneypotLogged.add(hpId);
              options.onLog?.({
                type: 'field_honeypot_skip',
                field: hpId,
                detail: `[Scan] Bỏ qua ô "${hpId}" vì nghi là honeypot (ẩn / nằm ngoài màn hình)`,
              });
            }
            continue;
          }

          const isCheckbox = await field.evaluate((el) => el.type === 'checkbox').catch(() => false);
          const isSelect = await field.evaluate((el) => el.tagName === 'SELECT').catch(() => false);
          if (isCheckbox) {
            // Với checkbox, nhiều trang ẩn thẻ <input> (display:none, opacity:0, sr-only) và hiển thị qua <label> hoặc custom checkmark.
            // Do đó chỉ bỏ qua nếu CẢ input VÀ label/container bao ngoài đều bị ẩn hoàn toàn
            const isInputOrLabelVisible = await field.evaluate((el) => {
              if (el.offsetWidth > 0 || el.offsetHeight > 0 || el.offsetParent !== null) return true;
              const label = el.closest('label') || (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
              if (label && (label.offsetWidth > 0 || label.offsetHeight > 0 || label.offsetParent !== null)) return true;
              const parent = el.closest('.form-group, .custom-control, .checkbox, .field, .input-container, label, div');
              if (parent && (parent.offsetWidth > 0 || parent.offsetHeight > 0 || parent.offsetParent !== null)) return true;
              return false;
            }).catch(() => false);
            if (!isInputOrLabelVisible) continue;
          } else if (isSelect) {
            // Với <select>, nhiều framework (Select2, Choices, React-Select) ẩn thẻ gốc
            // Chỉ bỏ qua nếu form hoặc container cha của nó bị ẩn hoàn toàn
            const isSelectContainerVisible = await field.evaluate((el) => {
              if (el.offsetWidth > 0 || el.offsetHeight > 0 || el.offsetParent !== null) return true;
              const parent = el.closest('form, .select, .custom-select, .form-group, .field, .input-container, div');
              if (parent && (parent.offsetWidth > 0 || parent.offsetHeight > 0 || parent.offsetParent !== null)) return true;
              return false;
            }).catch(() => false);
            if (!isSelectContainerVisible) continue;
          } else {
            if (!(await field.isVisible())) {
              const invId = await field.evaluate((el) => el.id || el.name || '').catch(() => '');
              if (!page._uxInvisibleLogged) page._uxInvisibleLogged = new Set();
              if (invId && !page._uxInvisibleLogged.has(invId)) {
                page._uxInvisibleLogged.add(invId);
                options.onLog?.({
                  type: 'field_invisible_skip',
                  field: invId,
                  detail: `[Scan] Bỏ qua ô "${invId}" vì không visible`,
                });
              }
              continue;
            }
          }
          // Chống gõ đè: ô đang được gõ bởi vòng trước (lock tươi < 30s) thì bỏ qua
          const typingMarker = await field.getAttribute('data-ux-typing').catch(() => null);
          if (typingMarker) {
            if (Date.now() - Number(typingMarker || 0) < 30000) continue;
            // Lock quá hạn = vòng gõ cũ đã chết → dọn lock và cho phép gõ lại
            await field.evaluate((el) => el.removeAttribute('data-ux-typing')).catch(() => {});
          }
          const isMarkedFilled = (await field.getAttribute('data-ux-filled')) === '1';
          if (isMarkedFilled) {
            const isUncheckedBox = isCheckbox && !(await field.isChecked().catch(() => true));
            const currentVal = await field.inputValue().catch(() => null);
            const hasError = await field.evaluate((el) => {
              if (el.classList.contains('error') || el.classList.contains('invalid') || el.getAttribute('aria-invalid') === 'true') return true;
              const parent = el.closest('.input-group, .form-group, .field, .field-item, .reg-fields, .reg-section, .loco-group, .checkbox-group, .checkbox, label, div');
              if (!parent) return false;
              if (parent.classList.contains('invalid') || parent.classList.contains('error')) return true;
              return parent.querySelector('.error, .error-entry, .invalid, .visible, .helper-text.visible, [role="alert"]') !== null;
            }).catch(() => false);

            // Nếu đã fill nhưng giá trị hiện tại bị rỗng hoặc đang bị báo lỗi hoặc là checkbox chưa được tích -> xóa mark để điền lại
            if ((currentVal !== null && currentVal.trim() === '') || hasError || isUncheckedBox) {
              await field.evaluate((el) => el.removeAttribute('data-ux-filled')).catch(() => {});
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

            // Trích xuất label và data-tag từ container cấu trúc Uplevel Rewards (#reg-container, .field-item)
            const parentField = element.closest('.field-item, .field, .form-group, .input-group, .reg-fields');
            if (parentField) {
              const labelSpan = parentField.querySelector('.label-entry, .fieldlabel, .field-label, .control-label, .label, label');
              if (labelSpan) {
                const t = (labelSpan.innerText || labelSpan.textContent || '').trim();
                if (t && !labels.includes(t)) labels.push(t);
              }
              const dataTag = parentField.getAttribute('data-tag') || parentField.getAttribute('data-field');
              if (dataTag && !labels.includes(dataTag)) labels.push(dataTag);
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

            const isReq = Boolean(element.required) ||
              element.getAttribute('aria-required') === 'true' ||
              element.classList.contains('required') ||
              element.classList.contains('error') ||
              labels.some((l) => /(^|\s)\*|\*(\s|$)/.test(l));

            return {
              id: element.id || '',
              name: element.getAttribute('name') || '',
              classes: `${element.className || ''} ${container ? container.className || '' : ''}`,
              dataAttributes,
              required: isReq,
              ariaRequired: element.getAttribute('aria-required') === 'true',
              isRequired: isReq,
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
                ...labels.filter((l) => l && l.length <= 60),
              ].filter(Boolean),
              containerText: containerText.slice(0, 400),
              kind: element.tagName.toLowerCase(),
              type: element.getAttribute('type')?.toLowerCase(),
              value: element.value,
              readOnly: element.readOnly,
              maxLength: element.maxLength,
            };
          });

          // Nhận diện trường email ngay khi lấy metadata của trường
          const isEmailVal = (metadata.type === 'email' || metadata.names?.some(isEmailFieldName) || (metadata.value && metadata.value.includes('@'))) && !metadata.names?.some((n) => /address|street|diachi/i.test(n));
          if (isEmailVal) {
            frameHasEmail = true;
            session.screenHasEmail = true;
            if (metadata.value && metadata.value.includes('@')) {
              session.emailFilled = true;
              session.emailScreenNumber = (session.completedScreens || 0) + 1;
            }
          }

          // Xử lý ô checkbox: chỉ tích ô BẮT BUỘC TÍCH (consent / checkbox đơn /
          // nhóm multi-select chưa ai chọn, trừ "None of the above").
          // Câu hỏi multi-select dùng checkbox tôn trọng lựa chọn có chủ đích
          // của solveSurveyCheckboxes — không tick nốt phần còn lại.
          if (metadata.type === 'checkbox') {
            visibleFieldCount += 1;
            const isAlreadyChecked = await field.isChecked().catch(() => metadata.checked);
            if (!isAlreadyChecked) {
              // Phân loại nhóm checkbox trong context của frame để tránh tick mù
              const cbGroupInfo = await field.evaluate((el) => {
                const noneOfAboveRe = /^(none\b|none of the above\b|none of these\b|không có\b|không có mục nào\b|not applicable\b|n\/a\b|neither\b|other\b)/i;
                const container = el.closest(
                  '.question, .survey-question, fieldset, .checkbox-group, .choices, .form-group, .answers, .step-content'
                ) || el.parentElement || document.body;
                const siblings = Array.from(container.querySelectorAll('input[type="checkbox"]'));
                const label = el.closest('label') || (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
                const text = ((label?.innerText || label?.textContent || '') + ' ' + (container.querySelector('h1, h2, h3, h4, legend, .question-title, p')?.innerText || '')).trim();
                return {
                  isConsent: /terms|privacy|consent|agree|accept|tcpa|policy|disclosure|opt[- ]?in|waiver|certify|authorize|acknowledge/i.test(text),
                  isNoneOfAbove: noneOfAboveRe.test((label?.innerText || label?.textContent || '').trim()),
                  anySiblingChecked: siblings.some((s) => s.checked),
                  multiChoiceGroup: siblings.length >= 2,
                  singleCheckbox: siblings.length === 1,
                  // Đếm số ô do CHÍNH TOOL đã tick trong nhóm (đánh dấu data-ux-multi-ticked)
                  // để câu hỏi chọn nhiều đáp án chỉ tick đúng 2 ô đầu rồi dừng.
                  tickedByUs: siblings.filter((s) => s.getAttribute('data-ux-multi-ticked') === '1').length,
                };
              }).catch(() => ({ isConsent: false, isNoneOfAbove: false, anySiblingChecked: true, multiChoiceGroup: false, singleCheckbox: false }));

              // Mặc định an toàn: không tick nếu phân loại bị lỗi.
              // Nhóm chọn nhiều: tick tối đa 2 ô ĐẦU TIÊN (nhanh, yêu cầu user), rồi dừng.
              // Ô đơn/consent: tick như cũ.
              const multiQuotaReached = cbGroupInfo.multiChoiceGroup && (cbGroupInfo.tickedByUs >= 2);
              const allowedToTick = !multiQuotaReached && (cbGroupInfo.singleCheckbox || cbGroupInfo.isConsent ||
                (cbGroupInfo.multiChoiceGroup && !cbGroupInfo.isNoneOfAbove));
              if (!allowedToTick) continue;

              try {
                await field.scrollIntoViewIfNeeded({ timeout: 600 }).catch(() => {});
                const isRealBrowser = Boolean(page?.mouse && typeof page.mouse.move === 'function');
                const consentPause = isRealBrowser
                  ? Math.floor(Math.random() * 120) + 140
                  : Math.floor(Math.random() * 30) + 30;
                if (page && typeof page.waitForTimeout === 'function') {
                  await page.waitForTimeout(consentPause).catch(() => {});
                } else {
                  await new Promise((r) => setTimeout(r, consentPause));
                }

                // 1. Click tự nhiên bằng humanClick trên trình duyệt thật (rê chuột Bézier và click vật lý)
                let checkedOk = false;
                if (isRealBrowser) {
                  await humanClick(page, field).catch(() => {});
                  checkedOk = await field.isChecked().catch(() => false);
                  if (!checkedOk && metadata.id) {
                    const labelLocator = frame.locator(`label[for="${metadata.id}"]`).first();
                    if (await labelLocator.count().catch(() => 0) > 0) {
                      await humanClick(page, labelLocator).catch(() => {});
                      checkedOk = await field.isChecked().catch(() => false);
                    }
                  }
                }

                // 2. Thử click thẻ label liên kết (nếu có)
                if (!checkedOk) {
                  try {
                    const labelHandle = await field.evaluateHandle((el) => {
                      return el.closest('label') || (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
                    });
                    if (labelHandle && labelHandle.asElement()) {
                      await labelHandle.asElement().click({ timeout: 1000 }).catch(() => {});
                      checkedOk = await field.isChecked().catch(() => false);
                    }
                  } catch {}
                }

                // 3. Dùng Playwright check({ force: true }) - chuẩn nhất nếu chưa checked
                if (!checkedOk) {
                  await field.check({ force: true, timeout: 1500 }).catch(() => {});
                  checkedOk = await field.isChecked().catch(() => false);
                }

                // 4. Click trực tiếp vào field
                if (!checkedOk) {
                  await field.click({ force: true, timeout: 1000 }).catch(() => {});
                  checkedOk = await field.isChecked().catch(() => false);
                }

                // 5. Nếu vẫn chưa checked (do custom styled label/checkmark overlay), click vào label hoặc checkmark
                if (!checkedOk) {
                  await field.evaluate((el) => {
                    const label = el.closest('label') || (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
                    if (label) {
                      const target = label.querySelector('.checkmark, .checkbox-custom, .indicator, [class*="check"], svg') || label;
                      target.click();
                    } else {
                      el.click();
                    }
                  }).catch(() => {});
                  checkedOk = await field.isChecked().catch(() => false);
                }

                // 6. Luôn cập nhật trạng thái DOM chuẩn React / Vue / Plain HTML qua native setter.
                // KHÔNG dispatch MouseEvent('click') sau khi ép checked: sự kiện click
                // sẽ toggle checkbox quay về unchecked → ô tick mất vô chủ trước submit.
                await field.evaluate((el) => {
                  if (!el.checked) {
                    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')?.set;
                    if (nativeSetter) {
                      nativeSetter.call(el, true);
                    } else {
                      el.checked = true;
                    }
                  }
                  el.setAttribute('aria-checked', 'true');
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                }).catch(() => {});

                checkedOk = await field.isChecked().catch(() => false);
                if (!checkedOk) {
                  continue;
                }
                // Đánh dấu ô do tool tick để nhóm multi-select đếm đúng quota 2 ô đầu
                await field.evaluate((el) => { el.dataset.uxMultiTicked = '1'; }).catch(() => {});
                await field.evaluate((el) => { el.dataset.uxFilled = '1'; }).catch(() => {});
                addVerifiedFieldCount(session, 1);
                session.autofillError = null;
                filledInThisPass += 1;

                const consentName = metadata.names?.[0] || metadata.id || metadata.name || 'checkbox';
                options.onLog?.({
                  type: 'checkbox_checked',
                  tag: 'INPUT',
                  id: metadata.id || null,
                  name: metadata.name || null,
                  text: consentName.slice(0, 100),
                  detail: `Đã tự động tích ô checkbox: ${metadata.id || metadata.name || consentName.slice(0, 50)}`,
                }, page);
              } catch {}
            }
            continue;
          }

          if (metadata.readOnly || ['hidden', 'radio', 'file', 'submit', 'button', 'reset', 'image', 'search'].includes(metadata.type)) continue;

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
                const verifyVal = await field.evaluate((el) => el.value || '').catch(() => '');
                if (!verifyVal || verifyVal.trim() === '') {
                  continue;
                }
                await field.evaluate((el) => { el.dataset.uxFilled = '1'; }).catch(() => {});
                addVerifiedFieldCount(session, 1);
                filledInThisPass += 1;
                continue;
              }
            }

            const displayName = metadata.names[0] ?? '';
            if (displayName) unmatchedFieldNames.add(displayName.slice(0, 40));
            // Log chẩn đoán: ô không tìm được giá trị + liệt kê các key record đang có
            const recKeys = (record && typeof record === 'object')
              ? Object.keys(record).filter((k) => record[k] !== '' && record[k] !== null && record[k] !== undefined).slice(0, 20)
              : [];
            options.onLog?.({
              type: 'field_unmatched',
              field: metadata.id || metadata.name || displayName,
              names: (metadata.names || []).slice(0, 6),
              recordKeys: recKeys,
              detail: `[Scan] Không tìm giá trị cho ô "${metadata.id || displayName}" (names=${(metadata.names || []).slice(0, 4).join(' | ')}; record keys=${recKeys.join(',') || 'EMPTY'})`,
            });
            continue;
          }

          // Bỏ qua nếu ô đã có giá trị thật (ngoại trừ mask rỗng như (___) ___-____, +1, mm/dd/yyyy hoặc email/zip chưa hợp lệ)
          if (metadata.kind !== 'select' && metadata.value) {
            const currentVal = metadata.value.trim();
            if (currentVal.toLowerCase() === String(valueToFill).trim().toLowerCase()) {
              await field.evaluate((el) => {
                el.dataset.uxFilled = '1';
                el.classList.remove('invalid', 'error');
                el.classList.add('valid', 'has-value');
                const parent = el.closest('.field-item, .form-group, .input-group, .loco-group');
                if (parent) {
                  parent.classList.remove('invalid', 'error');
                  parent.classList.add('valid', 'non-empty');
                  const err = parent.querySelector('.error-entry, .error');
                  if (err) err.style.display = 'none';
                }
              }).catch(() => {});
              continue;
            }
            const isPlaceholderMask = /^(\+1|\+1\s*|\(___\)\s*___-____|___-__-____|[_\-\(\)\s\.\/]+|mm\/dd\/yyyy)$/i.test(currentVal);
            const isInvalidEmail = (metadata.type === 'email' || metadata.names?.some((n) => /email|mail/i.test(n))) && !currentVal.includes('@');
            const isInvalidZip = metadata.names?.some((n) => /zip|postal|postcode/i.test(n)) && currentVal.replace(/\D/g, '').length < 5;
            const isFieldInError = metadata.classes?.includes('invalid') || metadata.classes?.includes('error');
            if (currentVal !== '' && !isPlaceholderMask && !isInvalidEmail && !isInvalidZip && !isFieldInError) continue;
          }

          if (metadata.kind === 'select') {
            await field.scrollIntoViewIfNeeded({ timeout: 600 }).catch(() => {});
            const isRealBrowser = Boolean(page?.mouse && typeof page.mouse.move === 'function');
            if (isRealBrowser) {
              await humanClick(page, field).catch(() => {});
            } else {
              if (typeof field.hover === 'function') {
                await field.hover({ timeout: 600 }).catch(() => {});
              }
              await field.click({ force: true, timeout: 1000 }).catch(() => {});
            }
            // Thời gian người dùng quét mắt đọc danh sách dropdown (180ms - 320ms trên browser thật)
            const selectPause = isRealBrowser
              ? Math.floor(Math.random() * 140) + 180
              : Math.floor(Math.random() * 30) + 40;
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
          } else if (metadata.type === 'date') {
            // <input type="date"> KHÔNG gõ từng ký tự được (keyboard gõ ISO sẽ bị
            // segment theo locale nuốt sai thứ tự MM/DD/YYYY). Phải set chuỗi ISO
            // trực tiếp qua fill() hoặc native value setter rồi bắn sự kiện.
            const isoDate = (() => {
              const raw = String(valueToFill).trim();
              if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
              const parsed = parseDobComponents(raw);
              return parsed?.isoDob || raw;
            })(); // matchFieldValue đã ưu tiên trả ISO khi metadata.type === 'date'
            options.onLog?.({
              type: 'date_fill_attempt',
              field: metadata.names?.[0] || metadata.id || 'date',
              detail: `[DateFill] Thử điền ô ngày ${metadata.id || metadata.name} với ${isoDate}`,
            });
            try {
              await field.fill(isoDate, { force: true, timeout: 2000 });
            } catch {}
            // Xác minh: nếu fill không ăn (validator trang xóa), set bằng native setter
            const dateVal = await field.inputValue().catch(() => '');
            if (dateVal.trim() !== isoDate) {
              await field.evaluate((el, val) => {
                const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
                const desc = Object.getOwnPropertyDescriptor(proto, 'value');
                if (desc?.set) desc.set.call(el, val);
                else el.value = val;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new Event('blur', { bubbles: true }));
              }, isoDate).catch(() => {});
            }
            // Xác minh lần cuối trước khi đánh dấu đã điền
            const finalDateVal = await field.inputValue().catch(() => '');
            if (finalDateVal && finalDateVal.trim() === isoDate) {
              options.onLog?.({
                type: 'field_filled',
                tag: 'INPUT',
                id: metadata.id || null,
                name: metadata.name || null,
                text: metadata.names?.[0] || 'date',
                detail: `Đã điền ô ngày [${metadata.id || metadata.name}]: ${finalDateVal}`,
              }, page);
              await field.evaluate((el) => {
                el.dataset.uxFilled = '1';
                el.classList.remove('invalid', 'error');
                el.classList.add('valid', 'has-value');
                const parent = el.closest('.field-item, .form-group, .input-group, .loco-group');
                if (parent) {
                  parent.classList.remove('invalid', 'error');
                  parent.classList.add('valid', 'non-empty');
                  const err = parent.querySelector('.error-entry, .error');
                  if (err) err.style.display = 'none';
                }
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new Event('blur', { bubbles: true }));
              }).catch(() => {});
              addVerifiedFieldCount(session, 1);
              filledInThisPass += 1;
              session.lastActionTime = Date.now();
              continue;
            }
            // Không điền được date — không đánh dấu, vòng quét sau thử lại
            options.onLog?.({
              type: 'date_fill_failed',
              field: metadata.names?.[0] || metadata.id || 'date',
              detail: `[DateFill] KHÔNG điền được ô ngày ${metadata.id || metadata.name}. Giá trị copy hiện tại: "${finalDateVal ?? ''}" (mong đợi "${isoDate}")`,
            });
            unmatchedFieldNames.add(`${metadata.names?.[0] ?? 'date'} (date fill failed)`);
            continue;
          } else {
            // Nhập từ từ mô phỏng nhịp gõ phím của người thật (chống bị phát hiện bot autofill)
            await humanType(field, valueToFill, page);

            // XÁC MINH SAU GÕ (fix): framework có thể clear ô (type=tel + maxlength,
            // React/Angular reset) — trước đây chỉ set data-ux-filled="1" nên ô rỗng vẫn bị coi
            // là đã điền và Submit được bấm với ô trống ("Zip code must be 5 digits",
            // "Email address invalid" trên form defaultform/My Resource Helper).
            // Nếu giá trị không còn khớp: gõ lại tối đa 2 lần; lần cuối dùng fill() khẩn.
            {
              let expectVal = String(valueToFill);
              // Ô số điện thoại/zip: chỉ giữ chữ số, đúng maxlength nếu trang giới hạn
              if (String(metadata.type || '').toLowerCase() === 'tel' || /zip|postal/i.test(metadata.names?.[0] || '')) {
                const maxLen = Number(metadata.maxLength) > 0 ? metadata.maxLength : expectVal.length;
                expectVal = expectVal.replace(/\D/g, '').slice(0, maxLen);
              }
              let okTyped = false;
              // 3 lần gõ lại + 1 lần kiểm tra cuối: trước đây lần fill() thứ 3 không được kiểm tra lại, nên ô đã đúng
              // vẫn bị báo "không giữ được giá trị", bỏ cờ filled và vòng quét sau gõ đè email lần nữa.
              for (let retry = 0; retry <= 3; retry++) {
                const current = await field.inputValue().catch(() => '');
                if (current.trim() === expectVal.trim()) { okTyped = true; break; }
                if (retry === 3) break;
                if (retry === 2 && typeof field.fill === 'function') {
                  await field.fill(expectVal, { force: true, timeout: 2000 }).catch(() => {});
                } else {
                  await humanType(field, expectVal, page, { simulateTypo: false });
                }
              }
              if (!okTyped) {
                const finalVal = await field.inputValue().catch(() => '');
                options.onLog?.({
                  type: 'field_fill_verify_failed',
                  field: metadata.names?.[0] || metadata.id || 'input',
                  detail: `[Verify] Ô không giữ được giá trị sau 3 lần thử — hiện "${String(finalVal).slice(0, 40)}" (mong đợi "${String(expectVal).slice(0, 40)}"). KHÔNG đánh dấu filled để vòng quét sau điền lại.`,
                }, page);
                await field.evaluate?.((el) => el.removeAttribute('data-ux-filled')).catch(() => {});
                await field.evaluate?.((el) => {
                  const parent = el.closest('.field-group, .form-group, .defaultform__form-group, .input-group');
                  if (parent && parent.classList.contains('valid')) { parent.classList.remove('valid', 'non-empty'); }
                }).catch(() => {});
                continue; // bỏ qua, không cộng filledInThisPass — vòng quét sau thử lại
              }
            }

            // Với ô địa chỉ (Street Address / City / State / Zip), nếu xuất hiện dropdown gợi ý autocomplete (Google Places, Loqate, PCA, ARIA listbox, Mapbox, v.v.),
            // BẮT BUỘC phải chờ API trả về và click chọn mục gợi ý đầu tiên thì web mới hợp lệ hóa địa chỉ để cho phép submit!
            const isAddressField = metadata.names.some((n) => /address|street|diachi/i.test(n));
            const isCityOrStateField = metadata.names.some((n) => /city|thanhpho|state|tinh|province|make|model|school|college|job/i.test(n));
            const isComboboxOrAutocomplete = Boolean(
              metadata.ariaAutoComplete ||
              metadata.classes?.includes('autocomplete') ||
              metadata.classes?.includes('typeahead') ||
              metadata.names?.some((n) => /autocomplete|suggest/i.test(n))
            );

            let selectedSuggestion = false;
            if (isAddressField || isCityOrStateField || isComboboxOrAutocomplete) {
              try {
                // 1. Kích hoạt trigger API gợi ý địa chỉ: focus và dispatch input/keydown
                await field.evaluate((el) => {
                  el.focus();
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
                  el.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowDown', bubbles: true }));
                }).catch(() => {});

                // 2. Chờ kết quả API gợi ý trả về qua mạng (polling tới ~1.6s, mỗi 150-200ms kiểm tra 1 lần)
                // Các API gợi ý địa chỉ (Google Maps Places / Loqate) thường debounce 300ms + network delay
                for (let poll = 0; poll < 8; poll++) {
                  if (page && typeof page.waitForTimeout === 'function') {
                    await page.waitForTimeout(poll === 0 ? 300 : 180).catch(() => {});
                  } else {
                    await new Promise((r) => setTimeout(r, poll === 0 ? 300 : 180));
                  }
                  selectedSuggestion = await selectFirstAddressSuggestion(page, frame, field, options);
                  if (selectedSuggestion) break;
                }

                if (!selectedSuggestion) {
                  // Fallback: dùng keyboard navigation (ArrowDown + Enter) để chọn mục đầu dropdown
                  await field.press('ArrowDown').catch(() => {});
                  if (page && typeof page.waitForTimeout === 'function') {
                    await page.waitForTimeout(120).catch(() => {});
                  } else {
                    await new Promise((r) => setTimeout(r, 120));
                  }
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

            // CHỈ dispatch thêm input/change/blur/keyup NẾU CHƯA CHỌN GỢI Ý.
            // Nếu ĐÃ CHỌN GỢI Ý TỪ API THÀNH CÔNG, TUYỆT ĐỐI KHÔNG dispatch lại input/keyup
            // vì sẽ làm widget địa chỉ (Google Places/Loqate) coi như ô bị người dùng sửa lại và hủy bỏ place_id đã chọn!
            if (!selectedSuggestion) {
              await field.evaluate((el) => {
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new Event('blur', { bubbles: true }));
                el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
              }).catch(() => {});
              await field.dispatchEvent('input').catch(() => {});
              await field.dispatchEvent('change').catch(() => {});
              await field.dispatchEvent('blur').catch(() => {});
            }
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
            element.dataset.uxFilled = '1';
            element.classList.remove('error', 'invalid');
            element.classList.add('has-value', 'valid');
            const parent = element.closest('.input-group, .loco-group, .form-group, .field, .field-item, .reg-fields');
            if (parent) {
              parent.classList.remove('error', 'invalid');
              parent.classList.add('valid', 'non-empty');
              const helper = parent.querySelector('.helper-text, .error, .error-entry');
              if (helper) {
                helper.classList.remove('visible');
                helper.style.display = 'none';
              }
            }
          }).catch(() => {});
          addVerifiedFieldCount(session, 1);
          session.lastActionTime = Date.now();
          session.autofillError = null;
          filledInThisPass += 1;

          options.onLog?.({
            type: 'field_filled',
            tag: (metadata.kind || 'input').toUpperCase(),
            id: metadata.id || metadata.name || null,
            name: metadata.name || null,
            text: String(valueToFill).slice(0, 50),
            detail: `Đã điền [${metadata.names?.[0] || metadata.id || 'ô'}]: ${String(valueToFill).slice(0, 30)}`,
          }, page);

          const isFilledEmail = (metadata.type === 'email' || metadata.names?.some(isEmailFieldName) || (valueToFill && String(valueToFill).includes('@'))) && !metadata.names?.some((n) => /address|street|diachi/i.test(n));
          if (isFilledEmail) {
            frameHasEmail = true;
            session.screenHasEmail = true;
            session.emailFilled = true;
            session.emailFillAt = Date.now();
            session.emailScreenNumber = (session.completedScreens || 0) + 1;
            console.log(`[Autofill] Đã điền trường email (${String(valueToFill).slice(0, 30)}). Đánh dấu màn hình này là màn điền email (Màn ${session.emailScreenNumber}).`);
          }

          // Dừng tự nhiên giữa 2 trường (Inter-field cognitive pause):
          // Người thật cần 700ms - 1400ms để đọc câu hỏi, mắt chuyển ô và não xử lý
          const isRealBrowser = Boolean(page?.mouse && typeof page.mouse.move === 'function');
          const fieldPause = isRealBrowser
            ? Math.floor(Math.random() * 700) + 700
            : Math.floor(Math.random() * 20) + 35;
          if (page && typeof page.waitForTimeout === 'function') {
            await page.waitForTimeout(fieldPause).catch(() => {});
          } else {
            await new Promise((resolve) => setTimeout(resolve, fieldPause));
          }

          // Thỉnh thoảng (~25%) người thật "lơ đãng" dài giữa các ô: hít thở, nhìn quanh (1.2s - 2.5s)
          if (isRealBrowser && Math.random() < 0.25) {
            const driftPause = Math.floor(Math.random() * 1300) + 1200;
            if (page && typeof page.waitForTimeout === 'function') {
              await page.waitForTimeout(driftPause).catch(() => {});
            } else {
              await new Promise((resolve) => setTimeout(resolve, driftPause));
            }
          }

          // 40% xác suất nhấn phím Tab để nhảy ô tiếp theo theo thói quen gõ form nhanh của người dùng
          if (isRealBrowser && Math.random() < 0.4 && page?.keyboard) {
            await page.keyboard.press('Tab').catch(() => {});
            await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 60) + 40));
          }
        } catch {
          // Trường có thể không tương tác được lúc này
        }
      }

      // Nếu có trường vừa được điền hoặc tick trong pass này, chờ 50ms để DOM cập nhật trạng thái
      if (filledInThisPass > 0) {
        await new Promise((resolve) => { setTimeout(resolve, 50); });
      }

      // Tự động trả lời câu hỏi khảo sát: chọn ngẫu nhiên radio buttons hoặc lựa chọn Yes/No/Tuổi/Thu nhập
      try {
        const customGenderPass = await handleCustomGenderButtons(frame, record);
        if (customGenderPass > 0) {
          filledInThisPass += customGenderPass;
          session.lastActionTime = Date.now();
          addVerifiedFieldCount(session, customGenderPass);
          session.autofillError = null;
        }

        const uplevelPass = await syncUplevelRewardsFields(frame, record);
        if (uplevelPass > 0) {
          filledInThisPass += uplevelPass;
          session.lastActionTime = Date.now();
          addVerifiedFieldCount(session, uplevelPass);
          session.autofillError = null;
        }

        const answeredSurvey = await handleRadioAndSurveyOptions(frame, record, session);
        if (answeredSurvey > 0) {
          filledInThisPass += answeredSurvey;
          session.lastActionTime = Date.now();
          addActionCount(session, answeredSurvey);
          session.autofillError = null;
          options.onLog?.({
            type: 'survey_answered',
            detail: `Đã tự động chọn câu trả lời khảo sát/lựa chọn (${answeredSurvey} câu).`,
          }, page);
        }

        // Tích hợp SurveySolver chuyên sâu (Ratings, Matrix, Custom Checkboxes)
        if (session.offerMode !== 'consent_only') {
          const surveySolverRes = await solveSurveyStep(frame, record, { ...options, autoClickNext: false });
          if (surveySolverRes.answeredCount > 0) {
            filledInThisPass += surveySolverRes.answeredCount;
            session.lastActionTime = Date.now();
            addActionCount(session, surveySolverRes.answeredCount);
            session.autofillError = null;
            options.onLog?.({
              type: 'survey_solver_answered',
              detail: `[SurveySolver] Đã tự động giải quyết ${surveySolverRes.answeredCount} câu hỏi khảo sát/checkbox.`,
            }, page);
          }
        } else {
          options.onLog?.({ type: 'consent_only_skip_survey', detail: 'Chế độ consent_only: bỏ qua giải khảo sát.' }, page);
        }
      } catch {}

      // Tự động phát hiện và mở đồng loạt tất cả các thẻ Offerwall trên trang cuối.
      // Các tab offer con được điền song song (mỗi tab một vòng quét riêng), giới hạn
      // số tab đồng thời bằng options.maxConcurrentSubOffers (mặc định 8) để không
      // nghẽn CPU/proxy; thẻ chưa mở được sẽ tự thử lại khi có tab hoàn tất.
      try {
        const openedOffers = await handleOfferwallCards(frame, page, options);
        if (openedOffers > 0) {
          filledInThisPass += openedOffers;
          addActionCount(session, openedOffers);
          session.autofillError = null;
          options.onLog?.({
            type: 'offerwall_opened',
            detail: `Đã tự động mở ${openedOffers} thẻ ưu đãi (Offerwall).`,
          });
        }
      } catch {}

      // Tự động phát hiện và bấm các nút bỏ qua / skip / negative trên màn ưu đãi trung gian
      try {
        const skippedOffers = await handleNegativeSkipButtons(frame);
        if (skippedOffers > 0) {
          filledInThisPass += skippedOffers;
          addActionCount(session, skippedOffers);
          session.autofillError = null;
          options.onLog?.({
            type: 'negative_skip_clicked',
            detail: `Đã tự động bấm nút bỏ qua ưu đãi trung gian (${skippedOffers} nút).`,
          });
        }
      } catch {}

      // Quét thêm một lượt an toàn trước khi submit: chỉ tích các ô BẮT BUỘC TÍCH.
      // Câu hỏi multi-select dùng checkbox phải tôn trọng lựa chọn có chủ đích của
      // solveSurveyCheckboxes (chọn 1-N đáp án rồi submit) — không tích nốt phần còn lại,
      // không tích "None of the above" khi nhóm đã có lựa chọn khác.
      try {
        const cbClassification = await frame.evaluate(() => {
          const isVisible = (el) => {
            if (!el || el.disabled) return false;
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          };
          const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]:not(:checked)')).filter((el) => el.disabled === false);
          const noneOfAboveRe = /^(none\b|none of the above\b|none of these\b|không có\b|không có mục nào\b|not applicable\b|n\/a\b|neither\b|other\b)/i;
          return checkboxes.map((cb, idx) => {
            const uid = `cb_sweep_${idx}_${Date.now()}`;
            cb.setAttribute('data-ux-sweep-cb', uid);
            const container = cb.closest(
              '.question, .survey-question, fieldset, .checkbox-group, .choices, .form-group, .answers, .step-content'
            ) || cb.parentElement || document.body;
            const siblings = Array.from(container.querySelectorAll('input[type="checkbox"]'));
            const label = cb.closest('label') || (cb.id ? document.querySelector(`label[for="${cb.id}"]`) : null);
            const text = ((label?.innerText || label?.textContent || '') + ' ' + (container.querySelector('h1, h2, h3, h4, legend, .question-title, p')?.innerText || '')).trim();
            const isConsent = /terms|privacy|consent|agree|accept|tcpa|policy|disclosure|opt[- ]?in|waiver|certify|authorize|acknowledge/i.test(text);
            const isNoneOfAbove = noneOfAboveRe.test((label?.innerText || label?.textContent || '').trim());
            const anySiblingChecked = siblings.some((s) => s.checked);
            return {
              uid,
              isConsent,
              isNoneOfAbove,
              anySiblingChecked,
              multiChoiceGroup: siblings.length >= 2,
              singleCheckbox: siblings.length === 1,
            };
          });
        }).catch(() => []);

        for (const info of cbClassification) {
          // Kết luận: chỉ tick khi (1) checkbox đứng một mình HOẶC (2) là consent,
          // hoặc (3) nhóm multi-choice chưa ai tick VÀ ô này không phải "None of the above".
          const allowed = info.singleCheckbox || info.isConsent ||
            (info.multiChoiceGroup && !info.anySiblingChecked && !info.isNoneOfAbove);
          if (!allowed) continue;
          const cb = frame.locator(`[data-ux-sweep-cb="${info.uid}"]`).first();
          if (await cb.count().catch(() => 0) === 0) continue;
          const isEnabled = await cb.isEnabled().catch(() => true);
          if (!isEnabled) continue;

          await cb.check({ force: true, timeout: 1000 }).catch(() => {});
          let nowChecked = await cb.isChecked().catch(() => false);
          if (!nowChecked) {
            await cb.evaluate((el) => {
              const label = el.closest('label') || (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
              if (label) {
                const target = label.querySelector('.checkmark, .checkbox-custom, .indicator, [class*="check"], svg') || label;
                try { target.click(); } catch {}
              }
              const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')?.set;
              if (nativeSetter) {
                nativeSetter.call(el, true);
              } else {
                el.checked = true;
              }
              el.setAttribute('aria-checked', 'true');
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }).catch(() => {});
            nowChecked = await cb.isChecked().catch(() => false);
          }
          if (nowChecked) {
            await cb.evaluate((el) => { el.dataset.uxFilled = '1'; }).catch(() => {});
            filledInThisPass += 1;
            addVerifiedFieldCount(session, 1);
            options.onLog?.({
              type: 'checkbox_checked',
              detail: 'Đã tự động tích ô checkbox bắt buộc (consent/đơn) trước khi submit.',
            });
          }
        }
      } catch {}

      // Đảm bảo đồng bộ lần cuối cho Uplevel Rewards (#reg-container) trước khi kiểm tra lỗi và bấm submit
      try {
        const finalUplevel = await syncUplevelRewardsFields(frame, record);
        if (finalUplevel > 0) {
          filledInThisPass += finalUplevel;
          addVerifiedFieldCount(session, finalUplevel);
        }
      } catch {}

      // Tự động bấm nút gửi / tiếp tục nếu có tùy chọn autoSubmit và vừa điền hoặc tích xong các trường
      // Kiểm tra an toàn trước khi submit: Nếu trên form hiện tại vẫn còn trường bắt buộc (required / *) hoặc trường đang bị lỗi chưa có dữ liệu, KHÔNG được bấm submit!
      const hasUnfilledRequiredOrErrorField = await frame.evaluate(() => {
        const isVisible = (el) => {
          if (!el || el.disabled) return false;
          if (el.closest('header, footer, nav')) return false;
          // Loại trừ trường nằm trong step ẩn, tab ẩn, carousel ẩn hoặc aria-hidden
          if (el.closest('[aria-hidden="true"], [inert], .inactive, .hidden, .hide, .step:not(.active):not(.current), .tab-pane:not(.active), .carousel-item:not(.active)')) return false;
          const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
          if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return false;
          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return false;
          return true;
        };

        const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea'));
        for (const input of inputs) {
          if (!isVisible(input)) continue;
          if (input.type === 'search' || input.closest('form[role="search"], form:has(input[type="search"][name="q"])')) continue;

          const val = (input.value || '').trim();
          let isChecked = true;
          if (input.type === 'checkbox') {
            isChecked = input.checked;
          } else if (input.type === 'radio') {
            // Đối với nhóm radio buttons: Nếu CÙNG NAME có bất kỳ radio nào đã được tích, thì nhóm đó đã hợp lệ!
            const radioName = input.name;
            if (radioName) {
              const group = Array.from(document.querySelectorAll(`input[type="radio"][name="${radioName}"]`));
              isChecked = group.some((r) => r.checked);
            } else {
              isChecked = input.checked;
            }
          }

          // Bỏ qua các trường tùy chọn không bắt buộc (apt, suite, unit, address2, secondary, optional, middle_name, notes, comments)
          const fieldMeta = `${input.name || ''} ${input.id || ''} ${input.className || ''}`.toLowerCase();
          const isExplicitOptional = /apt|suite|unit|address2|street2|secondary|middle|comments|notes|ext\b|optional/i.test(fieldMeta);
          if (isExplicitOptional) continue;

          const isRequiredAttr = input.required || input.getAttribute('aria-required') === 'true';
          const hasErrorClass = input.classList.contains('error') || input.getAttribute('aria-invalid') === 'true';

          // Chỉ coi là lỗi thực sự nếu phần tử thông báo lỗi ĐANG HIỂN THỊ và CÓ CHỮ THỰC TẾ
          const parentGroup = input.closest('.input-group, .form-group, .field, .loco-group, .checkbox-group, .checkbox, label, div');
          const hasParentError = parentGroup ? Array.from(parentGroup.querySelectorAll('.error:not(input):not(select), .error-message, .invalid-feedback, [role="alert"]')).some((errEl) => {
            if (!isVisible(errEl)) return false;
            const errText = (errEl.innerText || errEl.textContent || '').trim();
            return errText.length > 0;
          }) : false;

          // Checkbox: nếu đã checked thì hợp lệ; nếu chưa checked, chỉ bỏ qua nếu chắc chắn không phải consent/required/error
          if (input.type === 'checkbox') {
            if (isChecked) continue;
            const label = input.closest('label') || (input.id ? document.querySelector(`label[for="${input.id}"]`) : null);
            const textNear = ((label ? (label.innerText || label.textContent || '') : '') + ' ' + (parentGroup ? (parentGroup.innerText || parentGroup.textContent || '') : '')).toLowerCase();
            const isConsent = isRequiredAttr || hasParentError || hasErrorClass ||
              /accept|agree|consent|terms|tcpa|privacy|policy|disclosure|must\s*(?:accept|agree|check|confirm|be)|you\s*must|required|mandatory|i\s*represent|18\+|certify|acknowledge|authorize|understand|by\s*checking|by\s*clicking|continue|proceed/i.test(textNear) ||
              /consent|terms|agree|privacy|policy|disclosure|tcpa|optin|tos|rules|accept|confirm|legal|disclaimer|certify|authorize|resident|must/i.test(fieldMeta);
            if (!isConsent) {
              continue;
            }
          }

          let labelIsRequired = false;
          if (input.id) {
            const lbl = document.querySelector(`label[for="${input.id}"]`);
            if (lbl && /(^|\s)\*|\*(\s|$)/.test(lbl.innerText || lbl.textContent || '')) labelIsRequired = true;
          }
          if (!labelIsRequired && parentGroup && parentGroup.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select').length === 1) {
            const lbl = parentGroup.querySelector('label');
            if (lbl && /(^|\s)\*|\*(\s|$)/.test(lbl.innerText || lbl.textContent || '')) labelIsRequired = true;
          }

          const isEmailField = (input.type === 'email' || /email/i.test(input.name || '') || /email/i.test(input.id || ''));
          const isInvalidEmailVal = isEmailField && (!val || !val.includes('@'));
          const hasValidationIssue = Boolean(hasErrorClass || hasParentError || (input.validity && !input.validity.valid));

          if (isEmailField && isInvalidEmailVal) {
            return {
              unfilled: true,
              id: input.id || input.name || 'email',
              type: input.type || 'email',
              reason: 'missing_or_invalid_email',
              className: String(input.className || ''),
              containerClass: input.parentElement ? String(input.parentElement.className || '') : null,
            };
          }

          if ((isRequiredAttr || labelIsRequired) && (!val || !isChecked)) {
            return {
              unfilled: true,
              id: input.id || input.name || 'unknown',
              type: input.type || input.tagName.toLowerCase(),
              reason: 'missing_required',
              className: String(input.className || ''),
              containerClass: input.parentElement ? String(input.parentElement.className || '') : null,
            };
          }

          if (hasValidationIssue) {
            return {
              unfilled: true,
              id: input.id || input.name || 'unknown',
              type: input.type || input.tagName.toLowerCase(),
              reason: 'validation_error',
              className: String(input.className || ''),
              containerClass: input.parentElement ? String(input.parentElement.className || '') : null,
            };
          }
        }
        return { unfilled: false };
      }).catch(() => ({ unfilled: false }));

      // Nhận diện loại màn hình hiện tại (Màn 5 DOB/Gender, Jump Page, màn có ô email, v.v.)
      const screenInfo = await frame.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea, [id="btn-option"], .btn-option'));
        const text = inputs.map((el) => `${el.name || ''} ${el.id || ''} ${el.className || ''} ${el.getAttribute('data-tf-element-role') || ''}`).join(' ').toLowerCase();
        const hasDob = /dob|birth|bday|month.*year|year.*month|birth_month|dob_month/i.test(text);
        const hasGender = /gender|male|female/i.test(text);
        const isScreen5 = (hasDob && hasGender) || hasDob || (hasGender && !/phone|address|street|email|firstname/i.test(text));

        const hasEmailInput = inputs.some((el) => {
          const type = (el.getAttribute('type') || '').toLowerCase();
          const name = (el.getAttribute('name') || '').toLowerCase();
          const id = (el.id || '').toLowerCase();
          const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
          const aria = (el.getAttribute('aria-label') || '').toLowerCase();
          const role = (el.getAttribute('data-tf-element-role') || '').toLowerCase();
          return type === 'email' || /email/i.test(name) || /email/i.test(id) || /email/i.test(placeholder) || /email/i.test(aria) || role === 'email';
        });

        const hasJumpCta = Boolean(document.querySelector('.cta-button, .rjp-cta-button, .sjp-cta-button, a[href*="/next"], [aria-label*="Reward" i]'));
        const isJumpPage = inputs.length === 0 && hasJumpCta;

        // Chuẩn hóa key input: bỏ số ngẫu nhiên do trang khảo sát sinh lại mỗi vòng
        // (twyinputyes-1595 / -1680 là CÙNG một ô — không được tính là màn khác),
        // chỉ gạt hậu trì -số và chuỗi số dài ≥4 để không va chạm các id kiểu q1/q2.
        const normalizeKey = (v) => String(v || '').toLowerCase().replace(/-\d+\b|\d{4,}/g, '#');
        const visibleInputKeys = inputs
          .filter((el) => {
            const s = window.getComputedStyle ? window.getComputedStyle(el) : null;
            return !s || (s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0');
          })
          .map((el) => `${el.tagName}:${el.type || ''}:${normalizeKey(el.name || el.id || '')}`)
          .slice(0, 15)
          .join(',');
        const activeStep = document.querySelector('.step.is-active, fieldset[data-step]:not([disabled]), .step.active, .current-step, [class*="step-indicator"]');
        const stepIndicator = activeStep ? (activeStep.getAttribute('data-step') || String(activeStep.textContent || '').trim().slice(0, 20) || '') : '';
        const screenSignature = `${window.location.pathname}#${stepIndicator}#${visibleInputKeys}`;

        return { isScreen5, isJumpPage, hasDob, hasGender, hasEmailInput, screenSignature };
      }).catch(() => null);

      if (screenInfo?.hasEmailInput) {
        frameHasEmail = true;
        session.screenHasEmail = true;
      }

      if (screenInfo?.isScreen5) {
        session.currentScreen = 5;
        session.isAtScreen5 = true;
      }

      // Theo dõi chữ ký màn hình thực tế (True Screen Transition):
      // Chỉ tăng completedScreens khi màn hình/bước form THỰC SỰ thay đổi sau khi
      // đã submit form (hasSubmittedCurrentScreen) HOẶC sau khi click đáp án
      // (answerClickPending) và màn thực sự đổi. Click mà trang không đi đâu
      // (không nhập form, cùng màn) KHÔNG được tính là màn nhảy.
      if (screenInfo?.screenSignature) {
        if (!session.lastActiveScreenSignature) {
          session.lastActiveScreenSignature = screenInfo.screenSignature;
          session._candidateScreenSignature = null;
        } else if (session.lastActiveScreenSignature !== screenInfo.screenSignature) {
          // Chống đếm ảo: chữ ký mới phải ỔN ĐỊNH 2 lượt quét liên tiếp (chữ ký
          // trang khảo sát rebuild DOM sinh id ngẫu nhiên giữa chừng) trước khi
          // chấp nhận là một màn thực sự khác. Sai khác thoáng qua sẽ bị hủy.
          const canCount = Boolean(session.hasSubmittedCurrentScreen || session.answerClickPending);
          const stableNew = session._candidateScreenSignature === screenInfo.screenSignature;
          if (canCount && stableNew) {
            session.completedScreens = (session.completedScreens || 0) + 1;
            session.currentScreen = session.completedScreens + 1;
            session.pageJumps = Math.max(session.pageJumps || 0, session.completedScreens);
            session.screenReached = Math.max(session.screenReached || 1, session.currentScreen);
            session.lastActiveScreenSignature = screenInfo.screenSignature;
            session._candidateScreenSignature = null;
            session.hasSubmittedCurrentScreen = false;
            session.answerClickPending = false;
            console.log(`[ScreenProgress] Xác nhận chuyển màn thực tế thành công: Màn ${(session.completedScreens - 1)} -> Màn ${session.currentScreen}`);
            options.onLog?.({
              type: 'screen_advanced',
              detail: `Đã hoàn thành Màn ${session.completedScreens}, chuyển sang Màn ${session.currentScreen}.`,
            }, page);
            options.onScreenAdvanced?.(session, session.currentScreen, session.pageJumps);

            // Copy nguyên HTML của màn vừa tới vào clipboard
            try {
              const screenHtml = await page.content().catch(() => '');
              const copied = await copyHtmlToClipboard(screenHtml);
              if (copied) {
                options.onLog?.({
                  type: 'html_copied',
                  detail: `Đã copy HTML Màn ${session.currentScreen} vào clipboard (${screenHtml.length} ký tự).`,
                }, page);
              }
            } catch {}

            // Gỡ bỏ bộ đếm submit trên các nút của màn mới
            await frame.evaluate(() => {
              document.querySelectorAll('[data-ux-submit-count], [data-ux-submitted]').forEach((b) => {
                b.removeAttribute('data-ux-submit-count');
                b.removeAttribute('data-ux-submitted');
                delete b.dataset.uxSubmitCount;
                delete b.dataset.uxSubmitted;
              });
            }).catch(() => {});
          } else {
            // Ghi nhận ứng viên chắn màn mới, chờ lượt sau xác nhận ổn định
            if (canCount && !stableNew) {
              options.onLog?.({
                type: 'screen_change_pending',
                detail: `Phát hiện màn mới nhưng chưa ổn định; chờ lượt quét tiếp theo xác nhận (chống đếm ảo).`,
              }, page);
            }
            session._candidateScreenSignature = screenInfo.screenSignature;
          }
        } else {
          session._candidateScreenSignature = null;
        }
      }

      // Nếu đang ở Jump Page (sau Màn 4) và chưa kiểm tra lead:
      // TẠM DỪNG, KHÔNG CLICK NÚT NHẬN THƯỞNG, GỌI KIỂM TRA LEAD TRÙNG IP!
      const isRealJumpPage = Boolean(screenInfo?.isJumpPage);
      if (isRealJumpPage && options.enableLeadCheck !== false && !session.screen5LeadVerified) {
        if (!session.emailFilled) {
          console.log(`[LeadCheck] Đang ở Jump Page nhưng ô Gmail/Email chưa được điền hợp lệ. Bỏ qua kiểm tra lead, tiếp tục làm form.`);
        } else if (!session.screen5LeadCheckTriggered) {
          session.screen5LeadCheckTriggered = true;
          session.leadCheckTriggered = true;
          session.leadCheckStatus = 'checking';
          session.leadCheckReason = 'jump_page';
          console.log(`[LeadCheck] Đang ở Jump Page nhận thưởng (sau Màn ${session.completedScreens || 0}). Bắt đầu tạm dừng và chờ kiểm tra lead...`);
          options.onLog?.({
            type: 'jump_page_lead_check',
            detail: `Đã tới Jump Page nhận thưởng sau khi điền ${session.completedScreens || 0} màn. Bắt đầu chờ đợi lead (1 lần x 20s)...`,
          });
          if (typeof options.onEmailSubmitted === 'function') {
            options.onEmailSubmitted(session, page);
          } else if (typeof options.onScreen5Reached === 'function') {
            options.onScreen5Reached(session, page);
          }
          return; // Dừng lại ở Jump Page, đợi kết quả kiểm tra lead!
        }
      }

      // Kiểm tra và chủ động bấm nút submit/tiếp tục nếu có tùy chọn autoSubmit
      let rescueSucceeded = false;
      if (hasUnfilledRequiredOrErrorField?.unfilled) {
        console.log(`[Autofill] Phát hiện trường bắt buộc chưa điền hoặc bị lỗi: ${hasUnfilledRequiredOrErrorField.id} (${hasUnfilledRequiredOrErrorField.type}, class="${hasUnfilledRequiredOrErrorField.className || '?'}", container="${hasUnfilledRequiredOrErrorField.containerClass || '?'}"). Đang thử điền cứu trợ...`);
        try {
          const rescueFilled = await frame.evaluate((fieldInfo, rec) => {
            const el = (fieldInfo.id && document.getElementById(fieldInfo.id)) ||
                       (fieldInfo.id && document.querySelector(`[name="${fieldInfo.id}"]`)) ||
                       document.querySelector('input[required]:not([type="hidden"]), select[required]');
            if (!el) return false;
            if (el.type === 'checkbox') {
              const label = el.closest('label') || (el.id ? document.querySelector(`label[for="${el.id}"]`) : null);
              if (label) {
                const target = label.querySelector('.checkmark, .checkbox-custom, .indicator, [class*="check"]') || label;
                try { target.click(); } catch {}
              }
              el.checked = true;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
            if (el.tagName === 'SELECT') {
              const opts = Array.from(el.options).filter((o) => o.value && !/select|choose/i.test(o.text));
              if (opts.length > 0) {
                el.value = opts[0].value;
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
              }
              return false;
            }
            // Ô đang được humanType gõ dở (data-ux-typing = mốc thời gian): không chen vào, nếu không giá trị bị ghi đè giữa chừng.
            const typingAt = Number(el.getAttribute('data-ux-typing') || 0);
            if (typingAt && Date.now() - typingAt < 15000) return false;
            // Gravity Forms đặt name/id dạng input_159 nên phải đọc cả label, autocomplete, data-name/data-api;
            // chỉ dựa vào name/id thì ô "First name" rơi xuống nhánh cuối và bị điền họ tên đầy đủ.
            const labelEl = (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.closest('label');
            const meta = [el.name, el.id, el.placeholder, el.type, el.getAttribute('autocomplete'), el.getAttribute('aria-label'),
              el.getAttribute('data-name'), el.getAttribute('data-api'), labelEl?.innerText]
              .filter(Boolean).join(' ').toLowerCase();
            // Thứ tự điền cứu trợ: ưu tiên các trường định danh địa lý/họ tên trước, tuyệt đối không gán nhầm phone vào ô khác
            let fillVal = '';
            if (/email/i.test(meta)) {
              fillVal = rec.email || null;
            } else if (/city|town|^ct$|address-level2/i.test(meta) || el.id === 'ct' || el.name === 'city') {
              fillVal = rec.city || rec.town || 'Wasilla';
            } else if (/zip|postal|^zp$/i.test(meta) || el.id === 'zp' || el.name === 'zippost') {
              fillVal = rec.zipcode || '99654';
            } else if (/address|street|^ad$/i.test(meta) || el.id === 'ad' || el.name === 'address1') {
              fillVal = rec.address || '4125 N Inspiration Loop';
            } else if (/first|given|^fn$/i.test(meta) || el.id === 'fn' || el.name === 'firstname') {
              fillVal = rec.firstname || 'James';
            } else if (/last|family|surname|^ln$/i.test(meta) || el.id === 'ln' || el.name === 'lastname') {
              fillVal = rec.lastname || 'Smith';
            } else if (/birth|dob|bday/i.test(meta)) {
              fillVal = rec.dob || null;
            } else if ((/phone|mobile|^tl$/i.test(meta) || el.id === 'tl' || el.type === 'tel') && !/city|town|^ct$|zip|address|street/i.test(meta)) {
              fillVal = rec.phone || null;
            } else if (/name/i.test(meta)) {
              fillVal = rec.fullname || rec.firstname || null;
            } else {
              // Không nhận ra ô: để trống còn hơn điền họ tên vào ô lạ (site báo "Special characters are not permitted").
              fillVal = null;
            }

            if (fillVal) {
              el.value = fillVal;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
            return false;
          }, hasUnfilledRequiredOrErrorField, record).catch(() => false);

          if (rescueFilled === true) {
            addVerifiedFieldCount(session, 1);
            filledInThisPass += 1;
            rescueSucceeded = true;
            if (/email/i.test(hasUnfilledRequiredOrErrorField.id || hasUnfilledRequiredOrErrorField.type)) {
              session.emailFilled = true;
            }
          }
        } catch {}
      }

      // Kiểm tra xem trường lỗi có phải là trường tùy chọn hay không
      const isOptionalField = hasUnfilledRequiredOrErrorField?.id &&
        /apt|suite|unit|address2|street2|secondary|middle|comments|notes|ext\b|optional/i.test(hasUnfilledRequiredOrErrorField.id);

      // Cho thư viện autofill hoàn tất lượt thử trước; watchdog mới chuyển sang AI nếu vẫn kẹt.
      const isUnfilledEmailOrFatalError = hasUnfilledRequiredOrErrorField?.unfilled && !rescueSucceeded && !isOptionalField;
      if (isUnfilledEmailOrFatalError) {
        const fieldSignature = `${hasUnfilledRequiredOrErrorField.id || hasUnfilledRequiredOrErrorField.type}:${hasUnfilledRequiredOrErrorField.reason || 'unfilled'}`;
        const failingFieldIdentity = `${hasUnfilledRequiredOrErrorField.id || '?'} (type=${hasUnfilledRequiredOrErrorField.type || '?'}, reason=${hasUnfilledRequiredOrErrorField.reason || '?'}, class="${hasUnfilledRequiredOrErrorField.className || '?'}", container="${hasUnfilledRequiredOrErrorField.containerClass || '?'}")`;
        session.autofillError = `Thư viện chưa điền được trường ${hasUnfilledRequiredOrErrorField.id || hasUnfilledRequiredOrErrorField.type}.`;
        if (page._lastAutofillUnresolvedField !== fieldSignature) {
          page._lastAutofillUnresolvedField = fieldSignature;
          console.log(`[Autofill] Thư viện đã thử điền nhưng trường vẫn chưa hợp lệ: ${failingFieldIdentity}. Chặn submit và để watchdog chuyển AI sau lượt thử đầu.`);
          options.onLog?.({
            type: 'autofill_library_incomplete',
            detail: `Thư viện autofill chưa xử lý được trường [${hasUnfilledRequiredOrErrorField.id || hasUnfilledRequiredOrErrorField.type}] class="${hasUnfilledRequiredOrErrorField.className || '?'}" container="${hasUnfilledRequiredOrErrorField.containerClass || '?'}" reason=${hasUnfilledRequiredOrErrorField.reason || '?'}. Chặn submit; sẽ chuyển sang AI sau thời gian thử tự điền.`,
            failingField: {
              id: hasUnfilledRequiredOrErrorField.id || null,
              type: hasUnfilledRequiredOrErrorField.type || null,
              reason: hasUnfilledRequiredOrErrorField.reason || null,
              className: hasUnfilledRequiredOrErrorField.className || null,
              containerClass: hasUnfilledRequiredOrErrorField.containerClass || null,
            },
          });
        }
        return;
      }

      if (options.autoSubmit !== false) {
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
            const btnInfo = await submitBtn.evaluate((btn, currentFields) => {
              const text = (btn.innerText || btn.value || btn.textContent || '').trim().slice(0, 80);
              const tag = (btn.tagName || '').toUpperCase();
              const id = btn.id || null;
              const className = String(btn.className || '');
              const now = Date.now();
              const lastClick = Number(btn.dataset.uxLastSubmitTime || 0);
              let clickCount = Number(btn.dataset.uxSubmitCount || 0);
              const lastFields = Number(btn.dataset.uxLastFields || -1);

              // Chỉ reset khi có tiến triển ở màn mới; tính trước lần tăng bộ đếm hành động do submit bên dưới.
              if (currentFields > lastFields && lastFields !== -1) {
                clickCount = 0;
              }

              // 1. Thẻ <a> chuyển link / popup: chỉ bấm 1 lần nếu mở ra tab mới ngoài (_blank)
              const isExternalNav = tag === 'A' && btn.href && !btn.href.startsWith('javascript:') && !btn.href.startsWith('#') && btn.target === '_blank';
              if (isExternalNav && btn.dataset.uxSubmitted === '1') {
                return { shouldClick: false, text, tag, id, className, reason: 'a_already_clicked' };
              }

              // 2. Chống duplicate submit dồn dập: thời gian cooldown 1200ms
              if (now - lastClick < 1200) {
                return { shouldClick: false, text, tag, id, className, reason: 'cooldown' };
              }

              // 3. Giới hạn click: cho phép tối đa 10 lần cho mỗi nút trên cùng 1 trang (hỗ trợ multi-step forms)
              if (clickCount >= 10) {
                return { shouldClick: false, text, tag, id, className, reason: 'max_clicks_reached' };
              }

              btn.dataset.uxLastSubmitTime = String(now);
              btn.dataset.uxSubmitted = '1';
              btn.dataset.uxSubmitCount = String(clickCount + 1);
              btn.dataset.uxLastFields = String(currentFields + 1);
              return { shouldClick: true, text, tag, id, className, clickCount: clickCount + 1 };
            }, (session.autofillFields ?? 0) + (session.autofillActions ?? 0)).catch(() => null);

            if (btnInfo?.shouldClick) {
              // BẢO VỆ CHỐNG BẤM SUBMIT KHI DROPDOWN GỢI Ý ĐỊA CHỈ ĐANG MỞ:
              // Nếu trang web vừa mở dropdown gợi ý địa chỉ từ API, BẮT BUỘC PHẢI CHỌN GỢI Ý ĐẦU TIÊN TRƯỚC
              // rồi mới cho phép Submit, tránh form bị từ chối do chưa chọn địa chỉ từ danh sách gợi ý!
              try {
                const hasOpenSuggestions = await hasActiveAddressSuggestions(page, frame);
                if (hasOpenSuggestions) {
                  console.log('[Autofill] Phát hiện dropdown gợi ý địa chỉ đang mở; tự động chọn gợi ý trước khi bấm submit...');
                  await selectFirstAddressSuggestion(page, frame, null, options);
                  if (page && typeof page.waitForTimeout === 'function') {
                    await page.waitForTimeout(350).catch(() => {});
                  } else {
                    await new Promise((r) => setTimeout(r, 350));
                  }
                }
              } catch {}

              const submitLabel = btnInfo.text || btnInfo.id || 'Submit';
              console.log(`[Autofill] Bấm nút submit: <${btnInfo.tag}> "${submitLabel}" id="${btnInfo.id}" class="${btnInfo.className || ''}"`);

              // Ghi log submit rõ ràng vào session logs
              options.onLog?.({
                type: 'submit_clicked',
                tag: btnInfo.tag,
                id: btnInfo.id,
                className: btnInfo.className || null,
                text: submitLabel,
                detail: `Đã bấm nút submit/tiếp tục: <${btnInfo.tag}> "${submitLabel}" id="${btnInfo.id || '?'}" class="${btnInfo.className || '?'}"`,
              }, page);

              // Dừng ngắn quan sát trước khi nộp (pre-submit hesitation):
              // Nếu là trình duyệt thật (có mouse CDP), dừng 320ms - 550ms như người thật kiểm tra lại form;
              // Nếu là môi trường unit test (không có mouse), dừng 35ms - 55ms để vượt qua timeout test.
              const isRealBrowser = Boolean(page?.mouse && typeof page.mouse.move === 'function');
              const reviewPause = isRealBrowser
                ? Math.floor(Math.random() * 230) + 320
                : Math.floor(Math.random() * 20) + 35;
              await new Promise((resolve) => { setTimeout(resolve, reviewPause); });

              // Cuộn phần tử vào tầm nhìn
              await submitBtn.scrollIntoViewIfNeeded({ timeout: 400 }).catch(() => {});

              // Đảm bảo gỡ bỏ hoàn toàn disabled và pointer-events bị khóa
              await submitBtn.evaluate((b) => {
                b.disabled = false;
                b.removeAttribute('disabled');
                b.classList.remove('disabled');
                b.setAttribute('aria-disabled', 'false');
                b.style.pointerEvents = 'auto';
              }).catch(() => {});

              // Trên trình duyệt thật: di chuyển chuột Bézier tới nút và hover 140ms - 260ms trước khi nhấn
              if (isRealBrowser && typeof submitBtn.boundingBox === 'function') {
                const box = await submitBtn.boundingBox().catch(() => null);
                if (box && box.width > 0 && box.height > 0) {
                  const targetX = box.x + box.width * (0.3 + 0.4 * Math.random());
                  const targetY = box.y + box.height * (0.3 + 0.4 * Math.random());
                  await humanMouseMove(page, targetX, targetY);
                  await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 120) + 140));
                }
              }

              const isFirstSubmitOfSession = !session.firstSubmitHandled && !session.screen1Completed;
              const initialUrl = session.initialFormUrl || page.url();

              let openedPopup = null;
              const popupHandler = (popup) => { openedPopup = popup; };
              if (isFirstSubmitOfSession && typeof page.once === 'function') {
                page.once('popup', popupHandler);
              }

              // Thao tác click tự nhiên bằng humanClick (Bézier curves + CDP mouse events)
              const clickedNaturally = await humanClick(page, submitBtn);
              if (!clickedNaturally) {
                try {
                  await submitBtn.click({ force: true, timeout: 2000 });
                } catch (clickErr) {
                  console.warn('[Autofill] Playwright click lỗi:', clickErr.message);
                }
              }

              session.lastActionTime = Date.now();
              addActionCount(session, 1);

              // Xử lý đặc thù màn đầu nếu có tab quảng cáo mở ra ngoài
              if (isFirstSubmitOfSession) {
                session.firstSubmitHandled = true;
                // Chờ ngắn 200ms để bắt popup (nếu trang web cố bật tab quảng cáo)
                await new Promise((resolve) => setTimeout(resolve, 200));
                page.off?.('popup', popupHandler);

                // 1. Tắt tab popup quảng cáo mở không đúng (nếu có)
                if (openedPopup && !openedPopup.isClosed()) {
                  console.log(`[Autofill] Phát hiện tab mới bật lên (${openedPopup.url()}) sau submit lần 1. Đang tắt tab này...`);
                  options.onLog?.({
                    type: 'first_submit_popup_closed',
                    detail: `Đã tắt tab mở không đúng (${openedPopup.url()}) sau lần submit đầu.`,
                  });
                  openedPopup._uxClosedByApp = 'đóng popup';
                  await openedPopup.close().catch(() => {});
                  await page.bringToFront().catch(() => {});
                }

                // 2. Chỉ khôi phục về initialUrl nếu trang chính bị đẩy sang URL quảng cáo rác trắng trợn
                const currentUrl = page.url();
                const isSpamAdRedirect = /doubleclick\.net|googleadservices|popads|about:blank/i.test(currentUrl);
                if (isSpamAdRedirect) {
                  console.log(`[Autofill] Trang bị đẩy sang URL quảng cáo không đúng: [${currentUrl}]. Đang mở lại trang đầu [${initialUrl}]...`);
                  try {
                    await page.goto(initialUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                  } catch (gotoErr) {
                    console.warn('[Autofill] Lỗi khi mở lại trang đầu:', gotoErr.message);
                  }
                }
              }

              // Sau khi click submit: kiểm tra xem form có bị trang web chặn do lỗi validation không
              let submitError = null;
              try {
                if (!page.isClosed()) {
                  submitError = await frame.evaluate(() => {
                    const isVisible = (el) => {
                      if (!el) return false;
                      const s = window.getComputedStyle ? window.getComputedStyle(el) : null;
                      if (s && (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0')) return false;
                      return Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
                    };
                    const explicitErrorSelector = [
                      '.error-message', '.invalid-feedback', '.form-error', '.field-error',
                      '.validation-error', '.has-error .help-block', 'label.error',
                      '.parsley-errors-list.filled', '[data-error]:not([data-error="false"])',
                    ].join(', ');
                    const explicitErrors = Array.from(document.querySelectorAll(explicitErrorSelector))
                      .filter(isVisible)
                      .map((element) => (element.innerText || element.textContent || '').trim())
                      .filter((text) => text.length > 0 && !/^(ok|valid|success|accepted)$/i.test(text));
                    const validationMessagePattern = /required|invalid|incorrect|error|failed|not valid|please (?:enter|provide|select|accept|check)|must be|is missing|cannot be blank|can't be blank|does not match|doesn't match/i;
                    const alertErrors = Array.from(document.querySelectorAll('[role="alert"], [aria-live="assertive"], .alert-danger'))
                      .filter(isVisible)
                      .map((element) => (element.innerText || element.textContent || '').trim())
                      .filter((text) => validationMessagePattern.test(text));
                    const texts = Array.from(new Set([...explicitErrors, ...alertErrors]));
                    const invalidInputs = Array.from(document.querySelectorAll('input:invalid, select:invalid, [aria-invalid="true"], input.error'))
                      .filter((el) => isVisible(el) && el.type !== 'search' && !el.closest('form[role="search"], form:has(input[type="search"][name="q"])'));
                    const firstInvalid = invalidInputs[0] || null;
                    // Lỗi riêng của ô email (vd myresourcehelper: <p id="su-email-error">Email address invalid</p>) — các
                    // selector chung ở trên không bắt được, nên email bị từ chối mà app không đổi email khác.
                    const emailInput = Array.from(document.querySelectorAll('input[type="email"], input[name*="email" i], input[id*="email" i]')).find(isVisible);
                    let emailError = null;
                    if (emailInput && String(emailInput.value || '').includes('@')) {
                      const scope = emailInput.closest('.form-group, .field-group, .gfield, .input-group') || emailInput.parentElement;
                      const candidates = [
                        ...(scope ? Array.from(scope.querySelectorAll('*')) : []),
                        ...Array.from(document.querySelectorAll('[id*="email" i][id*="error" i], [class*="email" i][class*="error" i]')),
                      ];
                      emailError = candidates
                        .filter((el) => el !== emailInput && el.children.length === 0 && isVisible(el))
                        .map((el) => (el.innerText || el.textContent || '').trim())
                        .find((t) => /invalid|not valid|already|in use|exists|registered|blocked|incorrect|another|valid email|undeliverable|not allowed|not accepted/i.test(t)) || null;
                    }
                    if (emailError) {
                      return {
                        hasError: true,
                        firstError: emailError,
                        fieldTag: 'input',
                        fieldId: emailInput.id || null,
                        fieldName: emailInput.name || 'email',
                        fieldClass: String(emailInput.className || ''),
                        fieldContainerClass: emailInput.parentElement ? String(emailInput.parentElement.className || '') : null,
                        fieldType: 'email',
                        fieldValue: String(emailInput.value || ''),
                        allErrors: [emailError, ...texts].slice(0, 5),
                      };
                    }
                    return {
                      hasError: texts.length > 0 || invalidInputs.length > 0,
                      firstError: texts[0] || (firstInvalid ? (firstInvalid.name || firstInvalid.id) : null),
                      // Định danh phần tử lỗi để nâng cấp matcher sau này
                      fieldTag: firstInvalid ? firstInvalid.tagName.toLowerCase() : null,
                      fieldId: firstInvalid ? (firstInvalid.id || null) : null,
                      fieldName: firstInvalid ? (firstInvalid.name || null) : null,
                      fieldClass: firstInvalid ? String(firstInvalid.className || '') : null,
                      fieldContainerClass: firstInvalid && firstInvalid.parentElement ? String(firstInvalid.parentElement.className || '') : null,
                      fieldType: firstInvalid ? (firstInvalid.type || null) : null,
                      fieldValue: firstInvalid && 'value' in firstInvalid ? String(firstInvalid.value || '') : '',
                      allErrors: texts.slice(0, 5),
                    };
                  }).catch(() => null);
                }
              } catch {}

              // Form từ chối email/thông tin đã điền (lặp lại ≥ 2 lần): đổi email/record mới, bỏ dữ liệu cũ vào danh sách bị từ chối.
              // Không có thông báo lỗi nhưng bấm submit màn email ≥ 3 lần vẫn đứng yên: coi như email bị từ chối.
              const stuckOnEmail = !submitError?.hasError && frameHasEmail && session.emailFilled && (btnInfo?.clickCount || 0) >= 3;
              const rejectInfo = stuckOnEmail
                ? { hasError: true, firstError: `bấm submit ${btnInfo.clickCount} lần vẫn đứng ở màn email`, fieldType: 'email', fieldValue: session.assignedEmail || record?.email || 'email' }
                : submitError;
              if (rejectInfo?.hasError && await rotateRejectedFormData(frame, record, session, options, rejectInfo)) {
                session.hasSubmittedCurrentScreen = false;
                return;
              }

              if (submitError?.hasError) {
                console.log(`[Autofill] Submit chưa qua được do trang báo lỗi: ${submitError.firstError}. Đang gọi AI chẩn đoán và tự sửa lỗi...`);
                const fieldIdentity = submitError.fieldId || submitError.fieldName
                  ? `${submitError.fieldTag || 'field'}#${submitError.fieldId || submitError.fieldName} class="${submitError.fieldClass || '?'}" container="${submitError.fieldContainerClass || '?'}"`
                  : 'không rõ trường';
                console.log(`[Autofill] Phần tử lỗi: ${fieldIdentity} — nút submit: <${btnInfo?.tag || '?'}> id="${btnInfo?.id || '?'}" class="${btnInfo?.className || '?'}"`);
                options.onLog?.({
                  type: 'submit_rejected_with_error',
                  // Định danh đầy đủ của nút submit và trường lỗi để phân tích nâng cấp matcher
                  detail: `Form chưa gửi được do có lỗi validation: ${submitError.firstError}. Trigger: <${btnInfo?.tag || '?'}> id="${btnInfo?.id || '?'}" class="${btnInfo?.className || '?'}". Field lỗi: ${fieldIdentity}. Đang kích hoạt AI chẩn đoán và sửa lỗi.`,
                  submitButton: { tag: btnInfo?.tag || null, id: btnInfo?.id || null, className: btnInfo?.className || null, text: btnInfo?.text || null },
                  failingField: {
                    tag: submitError.fieldTag || null,
                    id: submitError.fieldId || null,
                    name: submitError.fieldName || null,
                    className: submitError.fieldClass || null,
                    containerClass: submitError.fieldContainerClass || null,
                  },
                });
                session.hasSubmittedCurrentScreen = false;
                void inspectAndFixFormWithAi(page, record, session, options);
                return;
              }

              session.hasSubmittedCurrentScreen = true;
              const isFirstClickOnThisScreen = !btnInfo?.clickCount || btnInfo.clickCount <= 1;
              if (isFirstClickOnThisScreen) {
                if (!session.completedScreens || session.completedScreens < 1) {
                  session.completedScreens = 1;
                  session.currentScreen = 2;
                  session.pageJumps = Math.max(session.pageJumps || 0, session.completedScreens);
                  session.screenReached = Math.max(session.screenReached || 1, session.currentScreen);
                  options.onScreenAdvanced?.(session, session.currentScreen, session.pageJumps);
                }
              }

              // Kiểm tra xem màn vừa submit có phải là màn điền email hay không
              const wasEmailScreenSubmit = frameHasEmail || session.screenHasEmail || screenInfo?.hasEmailInput || (session.emailFilled && !session.emailScreenSubmitted);

              if (wasEmailScreenSubmit) {
                session.emailScreenSubmitted = true;
                session.emailSubmitUrl = scanStartUrl;
                session.screenHasEmail = false;
                session.emailScreenNumber = session.completedScreens;
              }

              // Không check lead ngay sau khi bấm submit: lượt quét kế tiếp chỉ check khi đã thật sự qua màn email.

              // Kích hoạt quét tiếp theo sau 120ms để màn hình thao tác liên tục không nghỉ
            }
          } else if (filledInThisPass > 0) {
            // FALLBACK NẾU THIẾU NÚT BẤM HOẶC NÚT BẤM KHÔNG ĐƯỢC NHẬN DIỆN:
            // Chỉ chạy khi TRONG LƯỢT QUÉT NÀY vừa điền thêm được ô mới.
            // Trả về định danh phần tử đã gửi (id/class của div/button/form) để log nâng cấp matcher.
            const formSubmitted = await frame.evaluate(() => {
              const elementIdentity = (el) => el ? {
                tag: el.tagName.toLowerCase(),
                id: el.id || null,
                className: String(el.className || ''),
              } : null;
              const forms = Array.from(document.querySelectorAll('form')).filter((f) => {
                const rect = f.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
              });
              if (!forms.length) {
                // Thử tìm nút button, div.button, div.btn-option, .btn-option trong div chứa input
                const btn = document.querySelector('button[type="submit"], [role="button"], div.button, div.btn-option, .btn-option, a.btn, button:not([type="reset"])');
                if (btn) {
                  try {
                    const identity = elementIdentity(btn);
                    btn.click();
                    return { method: 'button_click', ...identity };
                  } catch {}
                }
                return { method: 'none' };
              }
              for (const form of forms) {
                // Còn nhóm radio đang hiện mà chưa chọn đáp án: chưa gửi, chờ lượt chọn đáp án
                // (Gravity Forms jgwentworth: gửi trước khi chọn "Choose your debt amount" thì bị trả lỗi).
                const shownRadios = Array.from(form.querySelectorAll('input[type="radio"]')).filter((r) => r.getClientRects().length > 0);
                const radioNames = new Set(shownRadios.map((r) => r.name).filter(Boolean));
                if ([...radioNames].some((n) => !shownRadios.some((r) => r.name === n && r.checked))) continue;
                const lastSubmit = Number(form.dataset.uxLastSubmitTime || 0);
                const now = Date.now();
                if (now - lastSubmit < 1200) continue;
                form.dataset.uxLastSubmitTime = String(now);
                try {
                  if (typeof form.requestSubmit === 'function') {
                    form.requestSubmit();
                    return { method: 'form_requestSubmit', ...elementIdentity(form) };
                  }
                  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                  return { method: 'form_dispatchEvent', ...elementIdentity(form) };
                } catch {}
              }
              return { method: 'none' };
            }).catch(() => ({ method: 'error' }));

            if (formSubmitted && formSubmitted.method !== 'none' && formSubmitted.method !== 'error') {
              const fallbackIdentity = formSubmitted.id || formSubmitted.className
                ? `${formSubmitted.tag || 'element'}#${formSubmitted.id || '?'} class="${formSubmitted.className || '?'}"`
                : 'không rõ định danh';
              console.log(`[Autofill] Không có nút submit chuẩn, đã kích hoạt fallback (${formSubmitted.method}) trên: ${fallbackIdentity}.`);
              options.onLog?.({
                type: 'submit_fallback',
                detail: `Đã tự động gửi form qua ${formSubmitted.method} dự phòng khi không tìm thấy nút submit. Phần tử: ${fallbackIdentity}.`,
                method: formSubmitted.method,
                element: { tag: formSubmitted.tag || null, id: formSubmitted.id || null, className: formSubmitted.className || null },
              });
              session.lastActionTime = Date.now();
              addActionCount(session, 1);
              session.hasSubmittedCurrentScreen = true;
              if (!session.completedScreens || session.completedScreens < 1) {
                session.completedScreens = 1;
                session.currentScreen = 2;
                session.pageJumps = Math.max(session.pageJumps || 0, session.completedScreens);
                session.screenReached = Math.max(session.screenReached || 1, session.currentScreen);
                options.onScreenAdvanced?.(session, session.currentScreen, session.pageJumps);
              }

              const wasEmailScreenFallback = frameHasEmail || session.screenHasEmail || screenInfo?.hasEmailInput || (session.emailFilled && !session.emailScreenSubmitted);
              if (wasEmailScreenFallback) {
                session.emailScreenSubmitted = true;
                session.emailSubmitUrl = scanStartUrl;
                session.screenHasEmail = false;
                session.emailScreenNumber = session.completedScreens;
              }

              setTimeout(() => { session.triggerAutofillScan?.(); }, 200);
            }
          }
        } catch (submitErr) {
          console.error('[Autofill] Lỗi trong quá trình xử lý submit:', submitErr.message);
        }
      }
    }

    if (session.autofillFields || session.autofillActions) return;
    if (unmatchedFieldNames.size) {
      session.autofillError = 'Không ô nào khớp tên cột. Ô trên trang: '
        + [...unmatchedFieldNames].slice(0, 12).join(', ');
    } else if (!visibleFieldCount) {
      session.autofillError = 'Chưa phát hiện thấy form hoặc ô nhập nào trên trang.';
    }
  }

  const isSpamAdUrl = (url = '') => {
    return /galaxystore\.samsung\.com|play\.google\.com\/store|apps\.apple\.com|popads|propellerads|clickadu|trafficjunky|zeroredirect|doubleclick\.net|syndication\.exoclick/i.test(url);
  };

  /**
   * Gắn lịch quét cho một tab để nhận form tải chậm và giới hạn AI fallback sau lượt autofill đầu.
   *
   * @param {object} page Tab Chrome cần theo dõi.
   * @return {void} Đăng ký bộ hẹn giờ và dọn khi tab đóng.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-10-21
   */
  function watchPage(page) {
    if (trackedPages.has(page)) return;

    trackedPages.add(page);
    let filling = false;
    let noProgressRounds = 0;
    let libraryPageUrl = '';
    let firstLibraryPassAt = 0;
    /**
     * Chạy một lượt autofill có khóa chống trùng và kích hoạt watchdog khi không có tiến triển.
     *
     * @return {Promise<void>} Hoàn tất lượt quét hoặc chuyển lỗi sang log.
     * @author ductv <ductv@getflycrm.com>
     * @since 2026-10-21
     */
    const scan = async () => {
      if (filling || page.isClosed() || page._aiFormFixing || page._aiAssistRunning) return;
      const u = typeof page.url === 'function' ? page.url() : '';
      if (!u || u.startsWith('chrome-error:') || u.startsWith('about:') || u.startsWith('chrome:')) {
        return;
      }
      // BẢO VỆ TRÁNH KẸT >20s: trang Cloudflare "Just a moment..." (challenge) không có form nào
      // và lệnh evaluate trên nó có thể treo vô hạn — kiểm tra nhanh (race 4s), nếu là/trang treo thì bỏ qua tab này.
      try {
        const cfInfo = await Promise.race([
          page.evaluate(() => {
            const t = `${document.title || ''} ${document.body ? String(document.body.innerText || '').slice(0, 200) : ''}`;
            return {
              title: String(document.title || ''),
              cf: /just a moment/i.test(t) || Boolean(document.querySelector('#challenge-form, #cf-chl-widget, script[src*="challenge-platform"], meta[http-equiv="refresh"][content*="360"]')),
            };
          }),
          new Promise((r) => setTimeout(() => r('timeout'), 4000)),
        ]);
        const isCfBlocked = cfInfo === 'timeout' || (cfInfo && cfInfo.cf);
        if (isCfBlocked) {
          const nowCf = Date.now();
          if (!page._uxCfLoggedAt || (nowCf - page._uxCfLoggedAt) > 60000) {
            page._uxCfLoggedAt = nowCf;
            const detail = `Tab ${u} gặp Cloudflare "Just a moment..." (challenge) — không có form để điền; chờ challenge tự xử lý, không ghi stuck nữa.`;
            console.warn(`[Autofill] ${detail}`);
            options.onLog?.({ type: 'cloudflare_challenge_detected', detail });
          }
          return;
        }
      } catch {
        // Trang có thể vừa điều hướng — cho phép lượt quét sau chạy tiếp.
      }
      if (libraryPageUrl !== u) {
        libraryPageUrl = u;
        firstLibraryPassAt = Date.now();
        noProgressRounds = 0;
        page._aiFormRepairRetry = null;
        page._lastAutofillUnresolvedField = null;
      }
      filling = true;
      const fieldsBefore = (session.autofillFields ?? 0) + (session.autofillActions ?? 0);
      // Một lượt quét bình thường xong trong vài giây; quá 20s là đang kẹt ở một lệnh không trả về, ghi lại chỗ kẹt.
      const stuckTimer = setTimeout(() => {
        const detail = `Lượt tự điền chạy quá 20s, đang kẹt ở: ${session.autofillStep || 'không rõ'} (${typeof page.url === 'function' ? page.url() : ''})`;
        console.warn(`[Autofill] ${detail}`);
        options.onLog?.({ type: 'autofill_stuck', detail });
      }, 20000);
      stuckTimer.unref?.();
      try {
        await fillVisibleForms(page);
      } catch {
        // Trang có thể điều hướng hoặc đóng giữa hai lần quét.
      } finally {
        clearTimeout(stuckTimer);
        filling = false;
      }
      const filled = ((session.autofillFields ?? 0) + (session.autofillActions ?? 0)) - fieldsBefore;
      if (filled > 0) {
        noProgressRounds = 0;
        // Điền được trường hoặc submit, quét tiếp ngay tức thì (80ms) để màn hình chạy liên tục
        setTimeout(() => { void scan(); }, 80);
      } else {
        // Chỉ đếm vòng không tiến triển khi trang thực sự có form/input, khảo sát hoặc nút bấm cần tương tác
        let hasInteractable = true;
        try {
          if (typeof page.evaluate === 'function' && !page.isClosed()) {
            hasInteractable = await page.evaluate(() => {
              if (!document.body || document.body.children.length === 0) return false;

              const isVisible = (el) => {
                if (!el) return false;
                const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
                if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return false;
                return Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
              };

              // Kiểm tra xem trang đã hoàn tất (Thank You / Congratulations) hay chưa
              const pageText = (document.body.innerText || '').toLowerCase();
              const pageUrl = (window.location.href || '').toLowerCase();
              const isThankYou = /thank\s*you|congratulations|confirmed|your\s*submission|application\s*received|cảm ơn/i.test(pageText) ||
                /thank[-_]?you|confirmation|success|completed|receipt/i.test(pageUrl);
              const anyForm = document.querySelector('form');
              const anySubmitBtn = document.querySelector('button[type="submit"], input[type="submit"], [data-vector-submit="true"], button.continue-btn, button.submit-btn');
              if (isThankYou && !anyForm && !anySubmitBtn) {
                return false;
              }

              // 1. Kiểm tra bất kỳ ô input / textarea / select nào đang hiển thị
              const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea, select'));
              if (inputs.some((el) => isVisible(el) && !el.disabled)) return true;

              // 2. Kiểm tra có nút bấm, button submit, hoặc nút chuyển bước nào đang hiển thị không
              const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"], a.btn, a.button, a.cta-button, a.rjp-cta-button, a.sjp-cta-button, .cta-button, .rjp-cta-button, .sjp-cta-button, a[href*="/next"], a[aria-label*="Reward" i]'));
              if (buttons.some((el) => isVisible(el) && !el.disabled)) return true;

              // 3. Kiểm tra có radio group hoặc câu hỏi khảo sát/quiz nào đang hiển thị không
              const surveyOptions = Array.from(document.querySelectorAll(
                'input[type="radio"], [role="radio"], [id="btn-option"], [id^="btn-option"], [id*="btn-option"], .btn-option, [data-vector-answer="true"], [data-element-type="survey_answer"], .choice-btn, .option-btn, .quiz-btn, .answer-btn, label.btn, .creative-survey-answer, a.choice, a.btn-option, a.choice-btn, a.option-btn, a.answer-btn, a.quiz-btn, .choices a, .answers a, .options a, .choice-container a, .options-container a, .loco-btn, .loco-option, .loco-choice, [data-loco-option], [data-loco-value]'
              ));
              if (surveyOptions.some((el) => isVisible(el) && !el.disabled)) return true;

              // 4. Có form hoặc iframe/widget nhúng (như LocoTomato) đang hiển thị
              const forms = Array.from(document.querySelectorAll('form, iframe, .loco-widget, [data-loco-widget]'));
              if (forms.some((el) => isVisible(el))) return true;

              return false;
            });
          }
        } catch {
          hasInteractable = true;
        }

        if (session.leadCheckStatus === 'checking') {
          // Đang đợi kiểm tra lead màn 5, không tính là bị kẹt để tránh gọi AI nhầm
          noProgressRounds = 0;
          return;
        }

        if (hasInteractable) {
          noProgressRounds += 1;
        } else {
          // Trang chưa có form hoặc đã hoàn tất, reset bộ đếm
          noProgressRounds = 0;
        }

        // Gọi AI Assist khi thực sự kẹt sau nhiều vòng liên tục không có tiến triển
        const stuckThreshold = options.stuckThreshold ?? 3;
        const libraryFirstPassDelayMs = options.libraryFirstPassDelayMs ?? 5_000;
        const libraryFirstPassFinished = Date.now() - firstLibraryPassAt >= libraryFirstPassDelayMs;
        if (noProgressRounds >= stuckThreshold && libraryFirstPassFinished && !page._aiAssistRunning && !page._aiFormFixing && !page.isClosed()) {
          noProgressRounds = 0;
          const tabRecord = page._assignedRecord || session.currentRecord || record;
          options.onLog?.({
            type: 'autofill_library_stalled',
            detail: 'Thư viện autofill đã được thử ít nhất 5 giây nhưng form chưa tiến triển; chuyển sang AI chẩn đoán.',
          });
          // Giữ callback onStuck cho tương thích ngược: nơi gọi có thể theo dõi trạng thái kẹt.
          options.onStuck?.(page);
          void inspectAndFixFormWithAi(page, tabRecord, session, options);
        }
      }
    };
    if (!session._pageScans) session._pageScans = new Set();
    session._pageScans.add(scan);
    session.triggerAutofillScan = () => {
      for (const s of (session._pageScans || [])) {
        try { void s(); } catch {}
      }
    };
    page.triggerAutofillScan = () => { void scan(); };

    const timer = setInterval(() => { void scan(); }, 250);
    timer.unref?.();
    if (!session._autofillTimers) session._autofillTimers = new Set();
    session._autofillTimers.add(timer);
    session._autofillTimer = timer;
    // Check lead sau màn email chạy độc lập với lượt quét (không bị AI / lượt kẹt chặn).
    const leadTimer = setInterval(() => { void checkLeadAfterEmailOnPage(page); }, 1000);
    leadTimer.unref?.();
    session._autofillTimers.add(leadTimer);
    if (typeof page.on === 'function') {
      page.on('framenavigated', (navFrame) => {
        if (typeof page.mainFrame !== 'function' || navFrame === page.mainFrame()) void checkLeadAfterEmailOnPage(page);
      });
      page.on('domcontentloaded', scan);
      page.on('load', scan);
      page.on('framenavigated', (navFrame) => {
        try {
          const u = typeof page.url === 'function' ? page.url() : '';
          const isMain = !navFrame || (typeof page.mainFrame === 'function' && navFrame === page.mainFrame());
          if (isMain && u && !u.startsWith('about:') && !u.startsWith('chrome:')) {
            const cleanU = u.split('#')[0];
            if (session.lastTrackedNavUrl && session.lastTrackedNavUrl.split('#')[0] !== cleanU) {
              session.lastTrackedNavUrl = u;
              session.pageJumps = (session.pageJumps || 0) + 1;
              session.screenReached = Math.max(session.screenReached || 1, (session.completedScreens || 0) + 1);
              options.onPageJump?.(session, session.pageJumps, u);
            } else if (!session.lastTrackedNavUrl) {
              session.lastTrackedNavUrl = u;
            }
          }
        } catch {}
        void scan();
      });
      page.on('frameattached', scan);
      page.on('popup', (popup) => {
        const pu = typeof popup?.url === 'function' ? popup.url() : '';
        if (isSpamAdUrl(pu)) {
          console.log(`[Autofill] Phát hiện popup rác (${pu}), đóng ngay lập tức.`);
          options.onLog?.({ type: 'popup_closed', detail: `Đã đóng popup quảng cáo rác: ${pu}` });
          popup.close?.().catch(() => {});
          return;
        }
        watchPage(popup);
      });
      page.on('close', () => {
        clearInterval(timer);
        clearInterval(leadTimer);
        session._autofillTimers?.delete(timer);
        session._autofillTimers?.delete(leadTimer);
        session._pageScans?.delete(scan);
      });
    }

    // Tự động xử lý dialog (alert, confirm, prompt) để tránh làm treo trình duyệt
    if (typeof page.on === 'function') {
      page.on('dialog', async (dialog) => {
        try {
          const msg = dialog.message()?.slice(0, 80) || '';
          console.log(`[Playwright] Tự động xác nhận dialog (${dialog.type()}): "${msg}"`);
          options.onLog?.({
            type: 'dialog_handled',
            detail: `Đã tự động xác nhận dialog ${dialog.type()}: "${msg}"`,
          });
          await dialog.accept().catch(() => {});
        } catch {}
      });

      // Lắng nghe crash để ghi nhận log chẩn đoán
      page.on('crash', () => {
        console.warn('[Playwright] Cảnh báo: Trang bị crash (OOM hoặc mất kết nối proxy)');
        options.onLog?.({
          type: 'page_crash',
          detail: 'Trang bị crash đột ngột (OOM hoặc mất kết nối proxy).',
        });
      });
    }

    void scan();
  }

  context.on('page', watchPage);
  for (const page of context.pages()) watchPage(page);
}
