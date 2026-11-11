import { getFallbackCity } from './get-fallback-city.mjs';
import { getNormalizedPhone } from './get-normalized-phone.mjs';
import { getPhoneAreaCode } from './get-phone-area-code.mjs';
import { normalizeFieldName } from './normalize-field-name.mjs';

/**
 * Đọc dữ liệu CSV hoặc JSON để mỗi form có thể chọn một bản ghi.
 * Hỗ trợ mọi trường dữ liệu (họ tên, địa chỉ, sđt, ngày sinh, email, SSN, bank, routing...).
 * Tự động phục hồi nếu JSON bị cắt cụt đuôi hoặc chứa trailing comma.
 *
 * @param {string} source Nội dung người dùng dán vào ô dữ liệu.
 * @return {object[]} Các bản ghi có tên cột và giá trị dạng chuỗi.
 * @throws {Error} Khi cấu trúc hoặc số lượng dữ liệu không hợp lệ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function parseAutofillRecords(source) {
  const content = String(source ?? '').trim();
  if (!content) return [];
  if (content.includes('\t')) throw new Error('Hãy dùng CSV hoặc JSON; bảng phân tách bằng tab chưa được hỗ trợ.');
  let records;
  const trimmedJson = content.replace(/,\s*$/, '').trim();
  if (trimmedJson.startsWith('[') || trimmedJson.startsWith('{')) {
    const tryCleanJson = str => {
      const cleaned = str.replace(/,\s*([}\]])/g, '$1').replace(/,\s*$/, '');
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
    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    if (!lines.length) throw new Error('Dữ liệu dạng pipe (|) không có dòng dữ liệu hợp lệ.');
    const firstCells = lines[0].split('|').map(c => c.trim().replace(/^\uFEFF/, ''));
    const isFirstLineData = firstCells.some(c => c.includes('@')) || /^(male|female|mr|ms|mrs)$/i.test(firstCells[2] || firstCells[3] || '') || /^\d{4}$/.test(firstCells[6] || '');
    const standardPipeHeaders = ['firstname', 'lastname', 'gender', 'title', 'birthday', 'birthmonth', 'birthyear', 'phone', 'address', 'city', 'state', 'zipcode', 'phone2', 'username', 'password', 'email'];
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
    records = dataLines.map(line => {
      const cells = line.split('|').map(c => c.trim());
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
    const headers = rows.shift()?.map(header => header.trim().replace(/^\uFEFF/, ''));
    if (!headers?.length || !rows.length) throw new Error('CSV cần hàng tiêu đề và ít nhất một bản ghi.');
    records = rows.map(cells => {
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
  return records.map(record => {
    if (!record || Array.isArray(record) || typeof record !== 'object') {
      throw new Error('Mỗi bản ghi phải là một đối tượng dữ liệu.');
    }
    const normalized = Object.fromEntries(headers.map(header => {
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
export { parseAutofillRecords };
