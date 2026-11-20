import test from 'node:test';
import assert from 'node:assert/strict';
import { matchFieldValue } from "../../autofill.mjs";
import { resolveProvidedFieldValue } from '../../src/autofill/record-values/resolve-provided-field-value.mjs';

test('autofill và repair dùng cụm từ hoặc mẫu trong đúng ô để lấy giá trị record', () => {
  const record = { phone: '8175550147', email: 'fixture@example.invalid', address: '10 Oak St', address2: 'Apt 7',
    firstname: 'Ada', lastname: 'Lovelace', fullname: 'Ada Lovelace', city: 'Austin', zipcode: '01234' };
  for (const [label, placeholder, source] of [
    ['Liên hệ', '(###) ###-####', 'phone'], ['Liên hệ', '09xx xxx xxx', 'phone'],
    ['Thông tin', 'VD: name@example.com', 'email'], ['Thông tin', 'VD: 123 Main St', 'address'],
    ['Thông tin', 'Số nhà và tên đường', 'address'], ['Mã', 'Bưu chính', 'zipcode'],
    ['Please enter your first name', '', 'firstname'], ['First', 'Name', 'firstname'], ['Họ và', 'Tên của bạn', 'fullname'],
    ['Điền họ và tên của bạn', '', 'fullname'], ['First and last name', '', 'fullname'], ['State your first name', '', 'firstname'],
    ['Name', 'Your family name', 'lastname'],
    ['Address', 'Line 2', 'address2'], ['Location', 'Enter your city', 'city'],
    ['Street address', '(555) 123-4567', null], ['Số điện thoại', 'Ví dụ: 123 đường Mẫu', null],
    ['Mã', '123456', null],
  ]) {
    const metadata = { label, placeholder, type: 'text', names: [label, placeholder] };
    const expected = record[source] ?? null;
    assert.equal(matchFieldValue(metadata.names, record, metadata), expected, label + ' / ' + placeholder);
    assert.equal(resolveProvidedFieldValue(metadata, record), expected, label + ' / ' + placeholder);
  }
});

test('matchFieldValue: Street Address, Zip Code, City never match phone even if disclaimer has phone text', () => {
  const record = {
    firstname: 'Donald',
    lastname: 'Trump',
    address: '1100 S Ocean Blvd',
    city: 'Palm Beach',
    state: 'FL',
    zipcode: '33480',
    phone: '8145551234',
    email: 'donald.trump8821@gmail.com',
  };

  const tcpaNoise = 'By providing your phone number and clicking Continue you agree to receive SMS and telemarketing calls at the mobile phone number provided.';

  // 1. Street Address field
  const addressCandidates = ['Street Address', 'address', tcpaNoise];
  const matchedAddress = matchFieldValue(addressCandidates, record, { type: 'text', name: 'address', id: 'address' });
  assert.equal(matchedAddress, '1100 S Ocean Blvd', 'Street Address must match address, NOT phone');

  // 2. Zip Code field
  const zipCandidates = ['Zip Code', 'zip', 'postal', tcpaNoise];
  const matchedZip = matchFieldValue(zipCandidates, record, { type: 'text', name: 'zip', id: 'zip' });
  assert.equal(matchedZip, '33480', 'Zip Code must match zipcode, NOT phone');

  // 3. City / Town field
  const cityCandidates = ['City / Town', 'city', tcpaNoise];
  const matchedCity = matchFieldValue(cityCandidates, record, { type: 'text', name: 'city', id: 'city' });
  assert.equal(matchedCity, 'Palm Beach', 'City must match city, NOT phone');

  // 4. State field
  const stateCandidates = ['State', 'state', tcpaNoise];
  const matchedState = matchFieldValue(stateCandidates, record, { type: 'text', name: 'state', id: 'state' });
  assert.equal(matchedState, 'FL', 'State must match state, NOT phone');

  // 5. Phone field (phải khớp đúng số điện thoại)
  const phoneCandidates = ['Phone Number', 'phone', tcpaNoise];
  const matchedPhone = matchFieldValue(phoneCandidates, record, { type: 'tel', name: 'phone', id: 'phone' });
  assert.equal(matchedPhone, '8145551234', 'Phone field must match phone');
});

test('giữ trống khi nhãn địa chỉ mâu thuẫn kiểu điện thoại', () => {
  const record = { address: '123 Example Street', address2: 'Apt 4', phone: '8175550147', email: 'fixture@example.invalid' };
  for (const hint of [{ label: 'Street Address' }, { placeholder: 'Enter your street address' }, { ariaLabel: 'Mailing Address' }, { label: 'Địa chỉ' }, { placeholder: 'Nhập địa chỉ của bạn' }]) {
    const metadata = { name: 'phone', id: 'phone_number', type: 'tel', names: ['phone'], ...hint };
    assert.equal(matchFieldValue(metadata.names, record, metadata), null);
    assert.equal(matchFieldValue(metadata.names, { phone: record.phone }, metadata), null);
  }
  assert.equal(matchFieldValue(['phone'], record, { label: 'Address Line 2', type: 'tel', name: 'phone' }), null);
  assert.equal(matchFieldValue(['email'], record, { label: 'Mailing Address', type: 'email', names: ['email'] }), null);
  assert.equal(matchFieldValue(['email'], record, { label: 'Email Address', type: 'email' }), record.email);
});

test('metadata đọc nhãn liên kết/nhãn nổi/placeholder từng ô, không mượn disclaimer hoặc nhãn ô bên cạnh', async t => {
  const { chromium } = await import('playwright');
  const { existsSync } = await import('node:fs');
  if (!existsSync(chromium.executablePath())) { t.skip('Chưa cài Chromium'); return; }
  const { collectFieldMetadata } = await import('../../src/autofill/collect-field-metadata.mjs');
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
  await page.goto('https://field-label.test/registration');
  await page.setContent(`<form><span id="address-label">Street Address</span><input id="phone" name="phone" type="tel" aria-labelledby="address-label">
    <div class="field-item"><span class="label-entry">Địa chỉ</span><input id="floating" type="tel"></div>
    <input id="hint" name="phone" type="tel" placeholder="Your street address">
    <label>Thông tin<input id="aria-hint" name="phone" aria-placeholder="123 Main St"></label>
    <div class="reg-fields"><label for="real-phone">Phone Number</label><input id="real-phone" type="tel"><label for="real-address">Street Address</label><input id="real-address" type="tel"></div>
    <p>By providing your phone number you agree to receive calls.</p></form>`);
  const record = { address: '123 Example Street', phone: '8175550147' };
  for (const id of ['phone', 'floating', 'hint', 'aria-hint', 'real-address']) {
    const metadata = await page.locator('#' + id).evaluate(collectFieldMetadata);
    assert.equal(matchFieldValue(metadata.names, record, metadata), id === 'aria-hint' ? record.address : null, id);
  }
  const phone = await page.locator('#real-phone').evaluate(collectFieldMetadata);
  assert.equal(phone.label, 'Phone Number');
  assert.equal(matchFieldValue(phone.names, record, phone), record.phone);
  await page.setContent('<form><span id="address-title">Street Address</span><input id="phone" name="phone" type="tel" aria-labelledby="address-title"><label for="actual-phone">Phone Number</label><input id="actual-phone" name="phoneNumber" type="tel"></form>');
  const { fillPageForms } = await import('../../src/autofill/fill-page-forms.mjs');
  const session = { currentRecord: record, enableLeadCheck: false, firstSubmitHandled: true, completedScreens: 1, autofillFields: 0 };
  await fillPageForms(page, { session, sessionRecord: record, options: { autoSubmit: false }, triggerLeadCheckAfterEmail() {} });
  assert.equal(await page.locator('#phone').inputValue(), '', 'giữ trống ô tel có nhãn địa chỉ');
  assert.equal((await page.locator('#actual-phone').inputValue()).replace(/\D/g, ''), record.phone, 'không bỏ qua ô phone thật nằm sau ô địa chỉ type tel');
});

test('ARIA chọn đúng dữ liệu khi name/id/type mâu thuẫn và giữ phone chia phần', () => {
  const record = { firstname: 'Ada', lastname: 'Lovelace', email: 'ada@example.invalid', phone: '8175550147', address: '123 Example Street', zipcode: '12345' };
  for (const [accessibleName, expected] of [['First Name', record.firstname], ['Last Name', record.lastname], ['Email Address', record.email], ['Phone Number', record.phone], ['Street Address', record.address], ['Zip Code', record.zipcode]]) {
    assert.equal(matchFieldValue(['phone'], record, { name: 'phone', id: 'phone', type: 'tel', accessibleName }), accessibleName === 'Street Address' ? null : expected, accessibleName);
    assert.equal(matchFieldValue(['address'], record, { name: 'address', id: 'address', type: 'text', ariaLabel: accessibleName }), expected, accessibleName);
  }
  assert.equal(matchFieldValue(['Phone Number', 'phone2'], record, { name: 'phone2', type: 'tel', accessibleName: 'Phone Number', maxLength: 3 }), '555');
  assert.equal(matchFieldValue(['phone'], { phone: record.phone }, { type: 'tel', accessibleName: 'Street Address' }), null);
});

test('aria-labelledby ghép nhiều ID đúng thứ tự, ưu tiên hơn aria-label và native label, fill form thật', async t => {
  const { chromium } = await import('playwright');
  const { existsSync } = await import('node:fs');
  if (!existsSync(chromium.executablePath())) { t.skip('Chưa cài Chromium'); return; }
  const { collectFieldMetadata } = await import('../../src/autofill/collect-field-metadata.mjs');
  const { fillPageForms } = await import('../../src/autofill/fill-page-forms.mjs');
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
  await page.goto('https://aria-fields.test/registration');
  await page.setContent(`<form>
    <span id="first-word">First</span><span id="name-word">Name</span><label for="phone">Phone Number</label>
    <input id="phone" name="phone" type="tel" aria-label="Phone Number" aria-labelledby="missing first-word name-word">
    <input id="address" name="address" aria-label="Email Address" aria-labelledby="missing-only">
    <span id="last-label">Last Name</span><input id="last" name="phone" type="tel" aria-labelledby="last-label">
    <input id="location" name="phone" type="tel" aria-label="Zip Code">
    <input id="street" name="phone" type="tel" aria-label="Street Address">
  </form>`);
  const record = { firstname: 'Ada', lastname: 'Lovelace', email: 'ada@example.invalid', phone: '8175550147', address: '123 Example Street', zipcode: '12345' };
  const metadata = await page.locator('#phone').evaluate(collectFieldMetadata);
  assert.equal(metadata.ariaLabelledByText, 'First Name');
  assert.equal(metadata.accessibleName, 'First Name');
  assert.equal((await page.locator('#address').evaluate(collectFieldMetadata)).accessibleName, 'Email Address');
  const session = { currentRecord: record, enableLeadCheck: false, firstSubmitHandled: true, completedScreens: 1, autofillFields: 0 };
  await fillPageForms(page, { session, sessionRecord: record, options: { autoSubmit: false }, triggerLeadCheckAfterEmail() {} });
  for (const [id, expected] of [['phone', record.firstname], ['address', record.email], ['last', record.lastname], ['location', record.zipcode], ['street', '']]) {
    assert.equal(await page.locator('#' + id).inputValue(), expected, id);
  }
});

test('nhãn riêng quyết định dữ liệu trong autofill và repair, mâu thuẫn hoặc thiếu dữ liệu thì giữ trống', () => {
  const record = { phone: '8175550147', address: '10 Oak St', email: 'fixture@example.invalid', zipcode: '01234' };
  for (const [metadata, expected] of [
    [{ name: 'address', label: 'Số điện thoại', type: 'tel' }, record.phone],
    [{ name: 'address', placeholder: 'Số điện thoại', type: 'text' }, record.phone],
    [{ name: 'phone', label: 'Địa chỉ đường phố', type: 'tel' }, null],
    [{ name: 'address', label: 'Địa chỉ email', type: 'text' }, record.email],
    [{ name: 'phone', autocomplete: 'postal-code', type: 'tel' }, record.zipcode],
    [{ name: 'address', type: 'tel' }, null],
    [{ name: 'phone', label: 'Phone verification code', autocomplete: 'one-time-code', type: 'tel' }, null],
    [{ name: 'address', label: 'Phone or street address', type: 'text' }, null],
    [{ name: 'phone', label: 'Số điện thoại', autocomplete: 'street-address' }, null],
  ]) {
    assert.equal(matchFieldValue([metadata.name], record, metadata), expected, JSON.stringify(metadata));
    assert.equal(resolveProvidedFieldValue(metadata, record), expected, JSON.stringify(metadata));
  }
  for (const field of [{ label: 'Địa chỉ', name: 'phone' }, { label: 'Số điện thoại', name: 'address' }]) {
    const incomplete = field.name === 'phone' ? { phone: record.phone } : { address: record.address };
    assert.equal(matchFieldValue([field.name], incomplete, field), null);
    assert.equal(resolveProvidedFieldValue(field, incomplete), null);
  }
});

test('quét lại hai ô đã đánh dấu điền nhưng bị đảo giá trị, giữ nguyên số người dùng nhập riêng', async t => {
  const { chromium } = await import('playwright');
  const { existsSync } = await import('node:fs');
  if (!existsSync(chromium.executablePath())) return t.skip('Chưa cài Chromium');
  const { createFormScopeFixture } = await import('../helpers/form-scope-browser-fixture.mjs');
  const { fillPageForms } = await import('../../src/autofill/fill-page-forms.mjs');
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const { page, session } = await createFormScopeFixture(browser, `<meta charset="utf-8"><form>
    <label>Điện thoại<input data-ux-filled="1" name="address" type="tel" value="10 Oak St"></label>
    <label>Địa chỉ<input id="update-phone-modal-input" data-ux-filled="1" name="phone" type="text" value="8175550147"></label>
    <button type="button" id="update-phone-modal-submit" onclick="this.dataset.sent=1">Save</button>
    <label>Phone number<input name="other" type="tel" value="2025550142"></label></form>`);
  await fillPageForms(page, { session, sessionRecord: { phone: '8175550147', address: '10 Oak St' },
    options: { autoSubmit: false }, triggerLeadCheckAfterEmail() {} });
  assert.equal((await page.locator('[name=address]').inputValue()).replace(/\D/g, ''), '8175550147');
  assert.equal(await page.locator('[name=phone]').inputValue(), '10 Oak St');
  assert.equal(await page.locator('[name=other]').inputValue(), '2025550142');
  assert.equal(await page.locator('#update-phone-modal-submit').getAttribute('data-sent'), null);
});

test('modal điện thoại giữ số đã đúng và chỉ bấm khi cho phép gửi, ô đã hợp lệ', async t => {
  const { chromium } = await import('playwright');
  const { existsSync } = await import('node:fs');
  if (!existsSync(chromium.executablePath())) return t.skip('Chưa cài Chromium');
  const { createFormScopeFixture } = await import('../helpers/form-scope-browser-fixture.mjs');
  const { fillPageForms } = await import('../../src/autofill/fill-page-forms.mjs');
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const { page, session } = await createFormScopeFixture(browser, `<form>
    <label>Phone<input id="update-phone-modal-input" type="tel" value="(817) 555-0147" oninput="this.dataset.edited=1"></label>
    <button type="button" id="update-phone-modal-submit" onclick="this.dataset.sent=Number(this.dataset.sent || 0)+1">Save</button></form>`);
  const phone = page.locator('input');
  const button = page.locator('button');
  for (const autoSubmit of [false, true]) {
    if (autoSubmit) await phone.evaluate(input => input.setAttribute('aria-invalid', 'true'));
    await fillPageForms(page, { session, sessionRecord: { phone: '8175550147' }, options: { autoSubmit }, triggerLeadCheckAfterEmail() {} });
    assert.equal(await button.getAttribute('data-sent'), null);
    if (!autoSubmit) assert.equal(await phone.getAttribute('data-edited'), null);
  }
  await phone.evaluate(input => input.removeAttribute('aria-invalid'));
  await fillPageForms(page, { session, sessionRecord: { phone: '8175550147' }, options: { autoSubmit: true }, triggerLeadCheckAfterEmail() {} });
  assert.equal(await button.getAttribute('data-sent'), '1');
});

test('đường nhập nhanh nhường ô có nhãn trái với selector, giữ số điện thoại và địa chỉ trống khi record thiếu', async t => {
  const { chromium } = await import('playwright');
  const { existsSync } = await import('node:fs');
  if (!existsSync(chromium.executablePath())) return t.skip('Chưa cài Chromium');
  const { fillUplevelVisibleFields } = await import('../../src/autofill/uplevel/fill-visible-fields.mjs');
  const { buildUplevelVisibleFieldValues } = await import('../../src/autofill/uplevel/build-visible-field-values.mjs');
  assert.equal(buildUplevelVisibleFieldValues({}).some(item => item.value), false);
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<form id="reg-container"><label>Street address<input id="tl" type="tel"></label><label>Phone number<input id="ad"></label></form>');
  await fillUplevelVisibleFields(page, { address: '10 Oak St', phone: '8175550147' });
  assert.deepEqual(await page.locator('input').evaluateAll(fields => fields.map(field => field.value)), ['', '']);
});

test('địa chỉ tổng hợp được nhận diện nhất quán khi điền và khi sửa form', () => {
  const record = { address: '10 Oak St', phone: '2025550123', address2: 'Unit 4', city: 'Austin', state: 'TX', zipcode: '78701' };
  for (const [label, placeholder, type, expected] of [
    ['Mailing Address', 'Street Address, City, State', 'text', record.address],
    ['Mailing Address', 'Street Address, City, State, ZIP Code', 'text', record.address],
    ['State', 'State abbreviation', 'text', record.state],
    ['City', 'City', 'text', record.city],
    ['ZIP Code', 'ZIP', 'text', record.zipcode],
    ['Address Line 2', 'Apartment number', 'text', record.address2],
    ['Mailing Address', 'Street Address, City, State', 'tel', null],
    ['Phone Number', 'Street Address, City, State', 'text', null],
  ]) {
    const metadata = { label, placeholder, type, name: 'contact' };
    assert.equal(matchFieldValue(['contact'], record, metadata), expected, label);
    assert.equal(resolveProvidedFieldValue(metadata, record), expected, label);
  }
});

test('nhãn và định danh cùng xác nhận dữ liệu dù placeholder cũ, giữ đầy đủ số từ hồ sơ', () => {
  const record = { firstname: 'An', lastname: 'Tran', phone: '2025550147', address: '10 Oak St' };
  for (const [metadata, expected] of [
    [{ name: 'first_name', label: 'First Name', placeholder: 'Last Name' }, record.firstname],
    [{ name: 'field1', autocomplete: 'family-name', label: 'Họ', placeholder: 'Tên' }, record.lastname],
    [{ name: 'address', label: 'Địa chỉ', type: 'tel' }, record.address],
    [{ name: 'phone', label: 'Street Address', type: 'tel' }, null],
    [{ name: 'field2', label: 'First Name', placeholder: 'Last Name' }, null],
    [{ name: 'phone', label: 'Phone', type: 'tel', pattern: String.raw`^\(\d{3}\) \d{3}-\d{4}$` }, '(202) 555-0147'],
    [{ name: 'phone', label: 'Phone', type: 'tel' }, record.phone],
    [{ name: 'phone1', label: 'Phone', maxLength: 3 }, '202'],
    [{ name: 'phone1', label: 'Phone', maxLength: 2 }, null],
    [{ name: 'phone', type: 'tel', label: 'Phone', maxLength: 8 }, null],
  ]) {
    assert.equal(matchFieldValue([metadata.name], record, metadata), expected, metadata.name);
    assert.equal(resolveProvidedFieldValue(metadata, record), expected, 'repair ' + metadata.name);
  }
  const missingName = { email: 'fixture.person@example.invalid' };
  assert.equal(matchFieldValue(['first_name'], missingName, { label: 'First Name' }), null);
  assert.equal(resolveProvidedFieldValue({ label: 'First Name' }, missingName), null);
});

/**
 * Kiểm tra giá trị giữ lại sau hai lượt điền trên một form cục bộ.
 * @param {object} page Tab trống của trình duyệt thử nghiệm.
 * @param {import('node:test').TestContext} t Ngữ cảnh dọn máy chủ cục bộ.
 * @return {Promise<void>} Hoàn tất khi các ô khớp với thông tin trong hồ sơ.
 * @throws {Error} Khi dữ liệu bị đảo trường, sai định dạng hoặc bị gõ đè.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
async function verifyRecordContactForm(page, t) {
  const { createServer } = await import('node:http');
  const { fillPageForms } = await import('../../src/autofill/fill-page-forms.mjs');
  const html = String.raw`<form>
    <label>First Name<input name="first_name" placeholder="Last Name" value="Tran" data-ux-filled="1"></label>
    <label>Last Name<input name="last_name" value="An" data-ux-filled="1"></label>
    <label>Phone<input name="phone" type="tel" required pattern="^\([0-9]{3}\) [0-9]{3}-[0-9]{4}$" value="2025550147" data-ux-filled="1"></label>
    <label>First Name<input name="given_name" value="Mai"></label></form>`;
  const server = createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    return new Promise(resolve => server.close(resolve));
  });
  await page.goto('http://127.0.0.1:' + server.address().port);
  const session = { lastObservedUrl: page.url(), firstSubmitHandled: true, completedScreens: 1, autofillFields: 0 };
  const context = { session, sessionRecord: { firstname: 'An', lastname: 'Tran', phone: '2025550147' },
    options: { autoSubmit: false }, triggerLeadCheckAfterEmail() {} };
  await fillPageForms(page, context);
  const fields = page.locator('input');
  assert.deepEqual(await fields.evaluateAll(inputs => inputs.map(input => input.value)), ['An', 'Tran', '(202) 555-0147', 'Mai']);
  assert.equal(Boolean(await page.locator('[name=phone]').evaluate(input => input.validity?.patternMismatch)), false);
  await page.evaluate(() => { window.edits = 0; document.addEventListener('input', () => window.edits++); });
  await fillPageForms(page, context);
  assert.equal(await page.evaluate(() => window.edits), 0);
}

test('Chromium điền đúng tên và số điện thoại qua hai lượt quét', async t => {
  const { chromium } = await import('playwright');
  const { existsSync } = await import('node:fs');
  if (!existsSync(chromium.executablePath())) return t.skip('Chưa cài Chromium');
  const browser = await chromium.launch();
  t.after(() => browser.close());
  await verifyRecordContactForm(await browser.newPage(), t);
});

test('Obscura điền đúng tên và số điện thoại qua hai lượt quét', async t => {
  const { resolveObscuraBinary } = await import('../../src/obscura-engine/resolve-obscura-binary.mjs');
  try { resolveObscuraBinary(); } catch { return t.skip('Chưa có binary Obscura'); }
  const { openObscuraBrowser } = await import('../../src/obscura-engine/open-obscura-browser.mjs');
  const session = await openObscuraBrowser({ slot: 994, port: 0, os: 'ipad', registerSession: false });
  t.after(() => session.close());
  await verifyRecordContactForm(session.page, t);
});
