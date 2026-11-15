import test from 'node:test';
import assert from 'node:assert/strict';
import { matchFieldValue } from "../../autofill.mjs";

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

test('nhãn và placeholder địa chỉ thắng id/name/type phone; thiếu địa chỉ phải để trống', () => {
  const record = { address: '123 Example Street', address2: 'Apt 4', phone: '8175550147', email: 'fixture@example.invalid' };
  for (const hint of [{ label: 'Street Address' }, { placeholder: 'Enter your street address' }, { ariaLabel: 'Mailing Address' }, { label: 'Địa chỉ' }, { placeholder: 'Nhập địa chỉ của bạn' }]) {
    const metadata = { name: 'phone', id: 'phone_number', type: 'tel', names: ['phone'], ...hint };
    assert.equal(matchFieldValue(metadata.names, record, metadata), record.address);
    assert.equal(matchFieldValue(metadata.names, { phone: record.phone }, metadata), null);
  }
  assert.equal(matchFieldValue(['phone'], record, { label: 'Address Line 2', type: 'tel', name: 'phone' }), record.address2);
  assert.equal(matchFieldValue(['email'], record, { label: 'Mailing Address', type: 'email', names: ['email'] }), record.address);
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
    <div class="reg-fields"><label for="real-phone">Phone Number</label><input id="real-phone" type="tel"><label for="real-address">Street Address</label><input id="real-address" type="tel"></div>
    <p>By providing your phone number you agree to receive calls.</p></form>`);
  const record = { address: '123 Example Street', phone: '8175550147' };
  for (const id of ['phone', 'floating', 'hint', 'real-address']) {
    const metadata = await page.locator('#' + id).evaluate(collectFieldMetadata);
    assert.equal(matchFieldValue(metadata.names, record, metadata), record.address, id);
  }
  const phone = await page.locator('#real-phone').evaluate(collectFieldMetadata);
  assert.equal(phone.label, 'Phone Number');
  assert.equal(matchFieldValue(phone.names, record, phone), record.phone);
  await page.setContent('<form><span id="address-title">Street Address</span><input id="phone" name="phone" type="tel" aria-labelledby="address-title"><label for="actual-phone">Phone Number</label><input id="actual-phone" name="phoneNumber" type="tel"></form>');
  const { fillPageForms } = await import('../../src/autofill/fill-page-forms.mjs');
  const session = { currentRecord: record, enableLeadCheck: false, firstSubmitHandled: true, completedScreens: 1, autofillFields: 0 };
  await fillPageForms(page, { session, sessionRecord: record, options: { autoSubmit: false }, triggerLeadCheckAfterEmail() {} });
  assert.equal(await page.locator('#phone').inputValue(), record.address, 'luồng autofill thực sự nhập địa chỉ vào input tel bị đặt tên sai');
  assert.equal((await page.locator('#actual-phone').inputValue()).replace(/\D/g, ''), record.phone, 'không bỏ qua ô phone thật nằm sau ô địa chỉ type tel');
});

test('ARIA chọn đúng dữ liệu khi name/id/type mâu thuẫn và giữ phone chia phần', () => {
  const record = { firstname: 'Ada', lastname: 'Lovelace', email: 'ada@example.invalid', phone: '8175550147', address: '123 Example Street', zipcode: '12345' };
  for (const [accessibleName, expected] of [['First Name', record.firstname], ['Last Name', record.lastname], ['Email Address', record.email], ['Phone Number', record.phone], ['Street Address', record.address], ['Zip Code', record.zipcode]]) {
    assert.equal(matchFieldValue(['phone'], record, { name: 'phone', id: 'phone', type: 'tel', accessibleName }), expected, accessibleName);
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
  for (const [id, expected] of [['phone', record.firstname], ['address', record.email], ['last', record.lastname], ['location', record.zipcode], ['street', record.address]]) {
    assert.equal(await page.locator('#' + id).inputValue(), expected, id);
  }
});
