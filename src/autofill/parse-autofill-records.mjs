import { getDobString } from './get-dob-string.mjs';
import { getFallbackCity } from './get-fallback-city.mjs';
import { getNormalizedPhone } from './get-normalized-phone.mjs';
import { getPhoneAreaCode } from './get-phone-area-code.mjs';
import { normalizeFieldName } from './normalize-field-name.mjs';

/**
 * Đọc dữ liệu CSV hoặc JSON để mỗi form có thể chọn một bản ghi.
 * Hỗ trợ mọi trường dữ liệu (họ tên, địa chỉ, sđt, ngày sinh, email, SSN, bank, routing...).
 * Chấp nhận mảng chuỗi cho cột mcp_answer_ của trường chọn nhiều.
 * Tự động phục hồi nếu JSON bị cắt cụt đuôi hoặc chứa trailing comma.
 *
 * @param {string} source Nội dung người dùng dán vào ô dữ liệu.
 * @return {object[]} Các bản ghi có tên cột chuẩn hóa, giữ giá trị đã cung cấp và bổ sung bí danh còn thiếu.
 * @throws {Error} Khi cấu trúc không hợp lệ hoặc một bản ghi có nhiều cột trùng tên sau chuẩn hóa.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
function parseAutofillRecords(source) {
  const content = String(source ?? '').trim();
  if (!content) return [];
  let records;
  let delimitedHeaders;
  const trimmedJson = content.replace(/,\s*$/, '').trim();
  const firstDataLine = content.match(/^(?![ \t]*#)[^\r\n]+/m)?.[0] || '';
  const delimiter = firstDataLine.replace(/"(?:[^"]|"")*"/g, '').match(/[,|\t]/)?.[0];
  if (trimmedJson.startsWith('[') || trimmedJson.startsWith('{')) {
    const tryCleanJson = str => {
      const cleaned = str.replace(/"(?:\\.|[^"\\])*"|,\s*([}\]])/g, (token, closing) => closing || token).replace(/,\s*$/, '');
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
  } else if (delimiter === '\t') {
    throw new Error('Hãy dùng CSV hoặc JSON; bảng phân tách bằng tab chưa được hỗ trợ.');
  } else if (delimiter === '|') {
    // 3. Hỗ trợ định dạng phân tách bằng dấu gạch đứng (|) tương tự file Config/Info/info.txt của tool PC
    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    if (!lines.length) throw new Error('Dữ liệu dạng pipe (|) không có dòng dữ liệu hợp lệ.');
    const firstCells = lines[0].split('|').map(c => c.trim().replace(/^\uFEFF/, ''));
    const isFirstLineData = firstCells.some(c => c.includes('@')) || /^(male|female|mr|ms|mrs)$/i.test(firstCells[2] || firstCells[3] || '') || /^\d{4}$/.test(firstCells[6] || '');
    const standardPipeHeaders = ['firstname', 'lastname', 'gender', 'title', 'birthday', 'birthmonth', 'birthyear', 'phone', 'address', 'city', 'state', 'zipcode', 'phone2', 'username', 'password', 'email'];
    let dataLines;
    if (isFirstLineData) {
      delimitedHeaders = standardPipeHeaders.slice(0, firstCells.length);
      while (delimitedHeaders.length < firstCells.length) {
        delimitedHeaders.push(`field${delimitedHeaders.length + 1}`);
      }
      dataLines = lines;
    } else {
      delimitedHeaders = firstCells;
      dataLines = lines.slice(1);
    }
    if (!dataLines.length) throw new Error('Dữ liệu tự điền cần ít nhất một bản ghi.');
    records = dataLines.map(line => {
      const cells = line.split('|').map(c => c.trim());
      if (cells.length > delimitedHeaders.length) throw new Error('Dòng dữ liệu dạng pipe có nhiều ô hơn số cột.');
      return cells;
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
        if (row.some(cell => cell.trim())) rows.push(row);
        row = [];
        value = '';
        if (character === '\r' && content[index + 1] === '\n') index += 1;
      } else {
        value += character;
      }
    }
    if (quoted) throw new Error('CSV có dấu nháy kép chưa đóng.');
    row.push(value);
    if (row.some(cell => cell.trim())) rows.push(row);
    delimitedHeaders = rows.shift()?.map(header => header.trim().replace(/^\uFEFF/, ''));
    if (!delimitedHeaders?.length || !rows.length) throw new Error('CSV cần hàng tiêu đề và ít nhất một bản ghi.');
    if (rows.some(cells => cells.length !== delimitedHeaders.length)) throw new Error('CSV có dòng không cùng số cột với tiêu đề.');
    records = rows;
  }
  if (!Array.isArray(records) || !records.length) {
    throw new Error('Dữ liệu tự điền cần ít nhất một bản ghi.');
  }
  const allHeaders = new Set();
  const suppliedRecords = records.map(record => {
    if (!delimitedHeaders && (!record || Array.isArray(record) || typeof record !== 'object')) {
      throw new Error('Mỗi bản ghi phải là một đối tượng dữ liệu.');
    }
    const entries = delimitedHeaders ? delimitedHeaders.map((header, index) => [header, record[index] ?? '']) : Object.entries(record);
    const supplied = Object.fromEntries(entries.map(([header, value]) => {
      const key = normalizeFieldName(header);
      if (!key) throw new Error('Tên cột tự điền không hợp lệ.');
      allHeaders.add(key);
      if (/^mcp_answer_/i.test(header.trim()) && Array.isArray(value) && value.every(item => typeof item === 'string' && item.trim())) {
        return [key, JSON.stringify(value)];
      }
      if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) {
        throw new Error('Giá trị tự điền phải là chữ, số hoặc true/false.');
      }
      return [key, String(value ?? '').trim()];
    }));
    if (Object.keys(supplied).length !== entries.length) throw new Error('Tên cột tự điền bị trùng sau chuẩn hóa.');
    return supplied;
  });
  if (!allHeaders.size) throw new Error('Dữ liệu tự điền cần ít nhất một tên cột hợp lệ.');
  const emptyRecord = Object.fromEntries(Array.from(allHeaders, key => [key, '']));
  return suppliedRecords.map(supplied => {
    const normalized = { ...emptyRecord, ...supplied };

    // Tự động làm giàu các trường (Enrichment) để tương thích tối đa với mọi mẫu form:
    // Chỉ tạo các bí danh ngày sinh khi hồ sơ có đủ ngày, tháng và năm.
    if (normalized.birthyear && normalized.birthmonth) {
      const dob = getDobString(normalized);
      if (dob) {
        normalized.dob ||= dob;
        normalized.dateofbirth ||= dob;
        normalized.birthdate ||= dob;
      }
      if (!normalized.age) {
        const year = parseInt(normalized.birthyear, 10);
        if (!Number.isNaN(year)) normalized.age = String(new Date().getFullYear() - year);
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
      normalized.zipcode ||= resolvedZip;
      normalized.zip ||= resolvedZip;
      normalized.postalcode ||= resolvedZip;
      normalized.ziporpostcode ||= resolvedZip;
    }

    // 3. Bang / Tỉnh (State Or Province)
    if (!normalized.state && normalized.stateorprovince) {
      normalized.state = normalized.stateorprovince;
    }

    // 3.5. Thành phố / Thị trấn (City / Town): chuẩn hóa mọi biến thể hoặc suy ra fallback chuẩn
    const resolvedCity = normalized.city || normalized.town || normalized.cityname || normalized.city_name || normalized.shippingcity || normalized.thanhpho;
    if (resolvedCity) {
      normalized.city ||= resolvedCity;
      normalized.town ||= resolvedCity;
      normalized.cityname ||= resolvedCity;
    } else {
      const fallbackCity = getFallbackCity(normalized.state || normalized.stateorprovince, normalized.zipcode || normalized.zip);
      normalized.city = fallbackCity;
      normalized.town = fallbackCity;
      normalized.cityname = fallbackCity;
    }

    // 4. Địa chỉ (Address Line 1 / Street / Street Address)
    const resolvedAddress = normalized.address || normalized.addressline1 || normalized.address1 || normalized.streetaddress || normalized.street || normalized.addressline || normalized.addr || normalized.homeaddress || normalized.streetaddr || '';
    if (resolvedAddress) {
      normalized.address ||= resolvedAddress;
      normalized.addressline1 ||= resolvedAddress;
      normalized.address1 ||= resolvedAddress;
      normalized.streetaddress ||= resolvedAddress;
      normalized.street ||= resolvedAddress;
    }

    // Bổ sung bí danh còn thiếu, giữ nguyên các số riêng đã khai cho nhà và di động.
    const phone = getNormalizedPhone(normalized);
    if (phone) {
      normalized.phone ||= phone;
      normalized.phonenumber ||= phone;
      normalized.cellphone ||= phone;
      const areaCode = getPhoneAreaCode(normalized);
      if (areaCode) normalized.areacode ||= areaCode;
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
    if (normalized.cardvalidationcode) {
      normalized.cvv ||= normalized.cardvalidationcode;
      normalized.cvc ||= normalized.cardvalidationcode;
    }
    if (normalized.cardnumber && !normalized.creditcard) {
      normalized.creditcard = normalized.cardnumber;
    }
    return normalized;
  });
}
export { parseAutofillRecords };
