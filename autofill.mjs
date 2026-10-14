import { randomInt } from 'node:crypto';

const excludedFieldNamePattern = /ssn|socialsecurity|taxid|routing|bank|account|acct|iban|swift|creditcard|cardnumber|cvv|cvc|^number$|email|electronicmail/;

/**
 * Đọc dữ liệu CSV hoặc JSON để mỗi form có thể chọn một bản ghi.
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
  if (content.length > 200_000) throw new Error('Dữ liệu tự điền tối đa 200 KB.');
  if (content.includes('\t')) throw new Error('Hãy dùng CSV hoặc JSON; bảng phân tách bằng tab chưa được hỗ trợ.');

  let records;
  if (content.startsWith('[')) {
    try {
      records = JSON.parse(content);
    } catch {
      throw new Error('Dữ liệu JSON không hợp lệ.');
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

  if (!Array.isArray(records) || !records.length || records.length > 1_000) {
    throw new Error('Dữ liệu tự điền cần từ 1 đến 1.000 bản ghi.');
  }
  const headers = Object.keys(records[0] ?? {});
  if (!headers.length || headers.length > 50 || headers.some((header) => !header.trim())) {
    throw new Error('Dữ liệu tự điền cần từ 1 đến 50 tên cột hợp lệ.');
  }
  const normalizedHeaders = headers.map(normalizeFieldName);
  if (new Set(normalizedHeaders).size !== headers.length || normalizedHeaders.includes('')) {
    throw new Error('Tên cột tự điền bị trùng hoặc không hợp lệ.');
  }
  if (normalizedHeaders.some((header) => excludedFieldNamePattern.test(header))) {
    throw new Error('Không hỗ trợ tự điền email, SSN hoặc thông tin tài khoản/ngân hàng.');
  }
  return records.map((record) => {
    if (!record || Array.isArray(record) || typeof record !== 'object'
      || Object.keys(record).length !== headers.length
      || headers.some((header) => !(header in record))) {
      throw new Error('Mỗi bản ghi phải có cùng các cột.');
    }
    return Object.fromEntries(headers.map((header) => {
      const value = record[header];
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
function normalizeFieldName(name) {
  return String(name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Theo dõi form trong một profile Chrome và điền một bản ghi ngẫu nhiên khi form xuất hiện.
 *
 * @param {object} context Playwright BrowserContext của profile.
 * @param {object[]} records Các bản ghi đã chuẩn hóa.
 * @param {string} allowedOrigin Origin website đích được phép điền.
 * @param {object} session Phiên để cập nhật số trường đã điền mà không ghi giá trị.
 * @return {void} Đăng ký theo dõi các trang hiện tại và trang mở sau.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
export function attachAutofill(context, records, allowedOrigin, session) {
  if (!records.length) return;
  const trackedPages = new WeakSet();

  /**
   * Điền các trường còn trống trên form đang hiển thị của một trang.
   *
   * @param {object} page Trang Chrome cần xử lý.
   * @return {Promise<void>} Hoàn tất lượt quét form.
   * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
   * @since 2026-10-15
   */
  async function fillVisibleForms(page) {
    if (page.isClosed() || new URL(page.url()).origin !== allowedOrigin) return;
    const pageForms = page.locator('form, [role="form"]');
    const forms = await pageForms.count() ? await pageForms.all() : [page.locator('body')];
    for (const form of forms) {
      if (!(await form.isVisible())) {
        await form.evaluate((element) => {
          delete element.dataset.autoleadRecord;
          delete element.dataset.autoleadComplete;
          for (const field of element.querySelectorAll('[data-autolead-filled]')) {
            delete field.dataset.autoleadFilled;
          }
        }).catch(() => {});
        continue;
      }
      if (await form.getAttribute('data-autolead-complete') === '1') continue;
      const savedRecordIndex = await form.getAttribute('data-autolead-record');
      let recordIndex = Number(savedRecordIndex);
      if (savedRecordIndex === null || !Number.isInteger(recordIndex)
        || recordIndex < 0 || recordIndex >= records.length) {
        recordIndex = randomInt(records.length);
        await form.evaluate((element, index) => { element.dataset.autoleadRecord = String(index); }, recordIndex);
      }
      const record = records[recordIndex];
      let filledFieldCount = 0;
      for (const field of await form.locator('input, textarea, select').all()) {
        if (!(await field.isVisible()) || !(await field.isEnabled())
          || await field.getAttribute('data-autolead-filled') === '1') continue;
        const metadata = await field.evaluate((element) => ({
          names: [element.getAttribute('aria-label'), element.getAttribute('placeholder'),
            element.getAttribute('name'), element.id, ...Array.from(element.labels ?? [], (label) => label.innerText)],
          kind: element.tagName.toLowerCase(),
          type: element.getAttribute('type')?.toLowerCase(),
          value: element.value,
          readOnly: element.readOnly,
        }));
        if (metadata.readOnly || ['hidden', 'checkbox', 'radio', 'file', 'submit', 'button', 'email'].includes(metadata.type)) continue;
        const fieldNames = metadata.names.map(normalizeFieldName);
        if (fieldNames.some((name) => excludedFieldNamePattern.test(name))) continue;
        const fieldName = fieldNames.find((name) => Object.hasOwn(record, name));
        if (!fieldName || record[fieldName] === '') continue;
        if (metadata.kind !== 'select' && metadata.value) continue;
        try {
          if (metadata.kind === 'select') {
            await field.selectOption({ label: record[fieldName] }, { timeout: 3000 })
              .catch(() => field.selectOption(record[fieldName], { timeout: 3000 }));
          } else {
            await field.fill(record[fieldName], { timeout: 3000 });
          }
          await field.evaluate((element) => { element.dataset.autoleadFilled = '1'; });
          filledFieldCount += 1;
          session.autofillFields = (session.autofillFields ?? 0) + 1;
          session.autofillRecord = recordIndex + 1;
          session.autofillError = null;
        } catch {
          session.autofillError = 'Có trường không điền được; kiểm tra tên cột hoặc lựa chọn trong form.';
        }
      }
      if (filledFieldCount) {
        await form.evaluate((element) => { element.dataset.autoleadComplete = '1'; });
      }
    }
  }

  /**
   * Gắn lịch quét cho một tab để nhận cả form tải chậm và form mở động.
   *
   * @param {object} page Tab Chrome cần theo dõi.
   * @return {void} Đăng ký bộ hẹn giờ và dọn khi tab đóng.
   * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
   * @since 2026-10-15
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
    const timer = setInterval(() => { void scan(); }, 1500);
    timer.unref?.();
    page.on('domcontentloaded', scan);
    page.on('close', () => clearInterval(timer));
    void scan();
  }

  context.on('page', watchPage);
  for (const page of context.pages()) watchPage(page);
}
